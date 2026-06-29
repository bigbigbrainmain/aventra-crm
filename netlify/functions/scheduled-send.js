const { TABS, rowToLead, rowToScheduled, getRange, updateRow, updateRange, ensureTab, isGenericInbox, leadIdTag } = require('./_sheets');

const FROM = process.env.OUTREACH_FROM || 'joe@aventrasites.online';
const FROM_NAME = process.env.OUTREACH_FROM_NAME || 'Joe Clacher';
const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';
const BOOKING_URL = process.env.BOOKING_URL || 'https://calendly.com/joe-s-clacher/30min';

const TAB_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email'];

// Plus-addressed reply-to (e.g. ollie+lead_x1@domain) delivers to the FROM
// mailbox while carrying the lead ID, so reply-webhook can match the lead.
function replyToFor(leadId) {
  const [local, domain] = FROM.split('@');
  return `${local}+${leadId}@${domain}`;
}

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:W');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === leadId) {
      return { lead: rowToLead(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async () => {
  try {
    await ensureTab(TABS.SCHEDULED, TAB_HEADERS);

    const rows = await getRange(TABS.SCHEDULED, 'A2:J');
    const now = Date.now();

    const allDue = rows
      .map((row, i) => rowToScheduled(row, i + 2))
      .filter(s => s.id && s.status === 'pending' && s.sendAt && new Date(s.sendAt).getTime() <= now);

    // Deduplicate by leadId — auto-lead-gen can double-fire and create two rows per lead
    const seenLeadIds = new Set();
    const due = [];
    const dupes = [];
    for (const item of allDue) {
      if (seenLeadIds.has(item.leadId)) {
        dupes.push(item);
      } else {
        seenLeadIds.add(item.leadId);
        due.push(item);
      }
    }
    for (const dupe of dupes) {
      await updateRow(TABS.SCHEDULED, dupe._row, [
        dupe.id, dupe.leadId, dupe.businessName, dupe.subject,
        dupe.body, dupe.sendAt, 'skipped', dupe.createdAt, 'Duplicate row', dupe.leadEmail,
      ]).catch(() => {});
      console.log(`[scheduled-send] Skipped duplicate row for ${dupe.businessName}`);
    }

    if (due.length === 0) {
      console.log('[scheduled-send] No emails due');
      return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
    }

    console.log(`[scheduled-send] Sending ${due.length} scheduled email(s)`);

    let sentCount = 0;
    let failedCount = 0;

    for (const item of due) {
      try {
        if (!item.leadEmail) throw new Error('No email address on scheduled item');

        // Re-check opt-out at send time — the lead may have unsubscribed or
        // bounced since this email was queued.
        const leadResult = await findLead(item.leadId);
        if (leadResult && leadResult.lead.outreachOptedOut === 'Yes') {
          await updateRow(TABS.SCHEDULED, item._row, [
            item.id, item.leadId, item.businessName, item.subject,
            item.body, item.sendAt, 'skipped', item.createdAt, 'Lead opted out', item.leadEmail,
          ]);
          console.log(`[scheduled-send] Skipped ${item.businessName} — opted out`);
          continue;
        }

        // Skip generic shared inboxes (info@ etc.) that may have been queued
        // before the filter existed — they reach a reception desk, not a buyer.
        if (isGenericInbox(item.leadEmail)) {
          await updateRow(TABS.SCHEDULED, item._row, [
            item.id, item.leadId, item.businessName, item.subject,
            item.body, item.sendAt, 'skipped', item.createdAt, 'Generic inbox (info@)', item.leadEmail,
          ]).catch(() => {});
          console.log(`[scheduled-send] Skipped ${item.businessName} — generic inbox ${item.leadEmail}`);
          continue;
        }

        // Idempotency guard: if this lead was emailed within the last 12h, a
        // duplicate scheduled row (auto-lead-gen double-fire) or a prior run
        // already sent this. Follow-ups are days apart (COLD_DELAY_DAYS=3) so
        // a same-day send is always a duplicate — skip without double-sending
        // or double-counting outreachCount.
        if (leadResult && leadResult.lead.lastOutreachAt &&
            (now - new Date(leadResult.lead.lastOutreachAt).getTime()) < 12 * 3600 * 1000) {
          await updateRow(TABS.SCHEDULED, item._row, [
            item.id, item.leadId, item.businessName, item.subject,
            item.body, item.sendAt, 'skipped', item.createdAt, 'Already emailed today', item.leadEmail,
          ]).catch(() => {});
          console.log(`[scheduled-send] Skipped ${item.businessName} — already emailed in last 12h`);
          continue;
        }

        const unsubUrl = `${APP_URL}/.netlify/functions/outreach-unsubscribe?id=${item.leadId}`;
        const cta = `If it'd be useful, I'd happily put together a free example homepage for your business so you can see exactly what it could look like — no commitment at all. Easiest is to grab a quick slot here: ${BOOKING_URL}`;
        const bodyHtml = item.body.replace(/\n/g, '<br>');
        const text = `${item.body}\n\n${cta}\n\nBest regards,\n--\nJoe Clacher\nAventra\n07710 988 228\naventrasites.online\n\nTo unsubscribe: ${unsubUrl}`;
        const html = `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.7; max-width: 600px;">
<p style="margin: 0 0 24px 0;">${bodyHtml}</p>
<p style="margin: 0 0 24px 0;">If it'd be useful, I'd happily put together a free example homepage for your business so you can see exactly what it could look like — no commitment at all. Easiest is to grab a quick slot here: <a href="${BOOKING_URL}" style="color: #2563eb;">${BOOKING_URL}</a></p>
<p style="margin: 0 0 24px 0;">Best regards,</p>
<p style="color: #555; font-size: 13px; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 16px; margin: 0 0 32px 0;">
  --<br>
  Joe Clacher<br>
  Aventra<br>
  07710 988 228<br>
  <a href="https://aventrasites.online" style="color: #555; text-decoration: none;">aventrasites.online</a>
</p>
<p style="font-size: 11px; color: #999; margin: 0;">
  <a href="${unsubUrl}" style="color: #999;">Unsubscribe</a>
</p>
</div>`;

        const apiKey = process.env.RESEND_API_KEY;
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            // Final safety net for concurrent/double invocations: Resend dedupes
            // identical keys for 24h, so two simultaneous runs that both pass the
            // guard above still produce only one email to this lead.
            'Idempotency-Key': `outreach-${item.leadId}`,
          },
          body: JSON.stringify({
            from: `${FROM_NAME} <${FROM}>`,
            to: [item.leadEmail],
            reply_to: [replyToFor(item.leadId), 'joe@aventrasites.online'],
            subject: item.subject,
            html,
            text,
            headers: {
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
            // Sanitised so Resend accepts the tag and the webhook can match it
            // back to the lead (the real leadId still drives reply_to).
            tags: [{ name: 'leadId', value: leadIdTag(item.leadId) }],
          }),
        });

        if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);

        const sentAt = new Date().toISOString();

        // Mark scheduled row as sent
        await updateRow(TABS.SCHEDULED, item._row, [
          item.id, item.leadId, item.businessName, item.subject,
          item.body, item.sendAt, 'sent', item.createdAt, '', item.leadEmail,
        ]);

        // Update lead outreach columns (S=outreachSentAt, T=outreachCount, U=lastOutreachAt)
        if (leadResult) {
          const { lead, rowNum: leadRow } = leadResult;
          const isFirst = !lead.outreachSentAt;
          const newCount = (lead.outreachCount || 0) + 1;
          await updateRange(TABS.LEADS, `S${leadRow}`, [
            isFirst ? sentAt : lead.outreachSentAt,
            newCount,
            sentAt,
          ]);
        }

        sentCount++;
        console.log(`[scheduled-send] Sent to ${item.businessName} (${item.leadEmail})`);
      } catch (err) {
        failedCount++;
        console.error(`[scheduled-send] Failed for ${item.businessName}:`, err.message);
        await updateRow(TABS.SCHEDULED, item._row, [
          item.id, item.leadId, item.businessName, item.subject,
          item.body, item.sendAt, 'failed', item.createdAt, err.message, item.leadEmail,
        ]).catch(() => {});
      }
    }

    console.log(`[scheduled-send] Done — sent: ${sentCount}, failed: ${failedCount}`);
    return { statusCode: 200, body: JSON.stringify({ sent: sentCount, failed: failedCount }) };
  } catch (err) {
    console.error('[scheduled-send] Fatal error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
