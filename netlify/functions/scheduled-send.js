const { TABS, rowToLead, rowToScheduled, getRange, updateRow, updateRange, ensureTab } = require('./_sheets');

const FROM = process.env.OUTREACH_FROM || 'ollie@aventrasites.online';
const FROM_NAME = process.env.OUTREACH_FROM_NAME || 'Ollie';
const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

const TAB_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email'];

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

    const due = rows
      .map((row, i) => rowToScheduled(row, i + 2))
      .filter(s => s.id && s.status === 'pending' && s.sendAt && new Date(s.sendAt).getTime() <= now);

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

        const unsubUrl = `${APP_URL}/.netlify/functions/outreach-unsubscribe?id=${item.leadId}`;
        const html = `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.7; max-width: 600px;">
<p style="white-space: pre-wrap; margin: 0 0 24px 0;">${item.body}</p>
<p style="color: #555; font-size: 13px; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 16px; margin: 0 0 32px 0;">
  --<br>
  Ollie Eastham<br>
  Co-Founder &amp; CRO<br>
  +44 7787 447731<br>
  <a href="https://aventrasites.online" style="color: #555; text-decoration: none;">aventrasites.online</a>
</p>
<p style="font-size: 11px; color: #999; margin: 0;">
  <a href="${unsubUrl}" style="color: #999;">Unsubscribe</a>
</p>
</div>`;

        const apiKey = process.env.RESEND_API_KEY;
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${FROM_NAME} <${FROM}>`,
            to: [item.leadEmail],
            reply_to: [`reply+${item.leadId}@aventrasites.online`],
            subject: item.subject,
            html,
            tags: [{ name: 'leadId', value: item.leadId }],
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
        const leadResult = await findLead(item.leadId);
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
