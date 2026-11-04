// Manual bulk send from a template (Outreach > Bulk send).
//
// GET                         → { cap, today, usage: { joe, ollie }, senders }
// POST { action: 'send', sender, templateId, leadId, subject, body }
//                             → sends ONE email now (the UI loops, so no single
//                               request risks the function timeout)
// POST { action: 'queue', sender, templateId, items: [{ leadId, subject, body, sendAt }] }
//                             → adds pending rows to Scheduled Outreach;
//                               scheduled-send delivers them on the hour
//
// The subject/body arrive already filled in per lead (the UI renders the
// template and lets the user tweak each one). The daily cap is enforced here,
// per sender per UK day, counting both sent and still-queued emails.

const { TABS, rowToLead, rowToScheduled, getRange, appendRow, appendRows, updateRange, ensureTab, genId, isGenericInbox } = require('./_sheets');
const { SENDERS, DAILY_CAP, sendTemplateEmail, leftoverPlaceholders, ukDate, usageByDay } = require('./_template-email');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SCHEDULED_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email', 'Type', 'Sender', 'Template ID'];
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit', 'Replied']);
const RECENT_MS = 12 * 3600 * 1000;

const json = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });

async function loadState() {
  await ensureTab(TABS.SCHEDULED, SCHEDULED_HEADERS);
  const [leadRows, schedRows] = await Promise.all([
    getRange(TABS.LEADS, 'A2:X'),
    getRange(TABS.SCHEDULED, 'A2:M'),
    // Older sheets only have headers up to K — label the new columns
    updateRange(TABS.SCHEDULED, 'K1', ['Type', 'Sender', 'Template ID']).catch(() => {}),
  ]);
  const leadsById = new Map();
  leadRows.forEach((row, i) => {
    const lead = rowToLead(row, i + 2);
    if (lead.id) leadsById.set(lead.id, lead);
  });
  const scheduled = schedRows.map((r, i) => rowToScheduled(r, i + 2)).filter(s => s.id);
  return { leadsById, scheduled };
}

// Returns an error string if this lead must not be emailed, else null.
function blockReason(lead, pendingLeadIds) {
  if (!lead) return 'Lead not found';
  if (!lead.email) return 'No email address';
  if (lead.outreachOptedOut === 'Yes') return 'Opted out / bounced';
  if (DEAD_STATUSES.has(lead.status)) return `Status is ${lead.status}`;
  if (isGenericInbox(lead.email)) return 'Generic inbox (info@)';
  if (pendingLeadIds.has(lead.id)) return 'Already has an email queued';
  if (lead.lastOutreachAt && Date.now() - new Date(lead.lastOutreachAt).getTime() < RECENT_MS) {
    return 'Already emailed in the last 12 hours';
  }
  return null;
}

function validateCopy(subject, body) {
  if (!subject || !subject.trim()) return 'Subject is empty';
  if (!body || !body.trim()) return 'Body is empty';
  const left = [...leftoverPlaceholders(subject), ...leftoverPlaceholders(body)];
  if (left.length) return `Unfilled placeholder ${left[0]}`;
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  try {
    if (event.httpMethod === 'GET') {
      const { scheduled } = await loadState();
      const usage = usageByDay(scheduled);
      const today = ukDate(new Date().toISOString());
      // Also return the next 14 days so the UI can check a "spread over <date>" choice
      const byDate = {};
      for (const [key, n] of Object.entries(usage)) {
        const [sender, date] = key.split('|');
        if (date >= today) (byDate[date] ||= { joe: 0, ollie: 0 })[sender] = n;
      }
      return json(200, {
        cap: DAILY_CAP,
        today,
        usage: { joe: usage[`joe|${today}`] || 0, ollie: usage[`ollie|${today}`] || 0 },
        byDate,
        senders: Object.values(SENDERS).map(({ id, name, email }) => ({ id, name, email })),
      });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const payload = JSON.parse(event.body || '{}');
    const sender = SENDERS[payload.sender];
    if (!sender) return json(400, { error: 'Pick a sender (joe or ollie)' });
    const templateId = String(payload.templateId || '');

    const { leadsById, scheduled } = await loadState();
    const usage = usageByDay(scheduled);
    const pendingLeadIds = new Set(scheduled.filter(s => s.status === 'pending').map(s => s.leadId));
    const nowIso = new Date().toISOString();

    // ── Send one now ──────────────────────────────────────────────
    if (payload.action === 'send') {
      const { leadId, subject, body } = payload;
      const lead = leadsById.get(String(leadId || ''));
      const blocked = blockReason(lead, pendingLeadIds) || validateCopy(subject, body);
      if (blocked) return json(400, { error: blocked });

      const today = ukDate(nowIso);
      const used = usage[`${sender.id}|${today}`] || 0;
      if (used >= DAILY_CAP) {
        return json(429, { error: `Daily limit reached — ${sender.name.split(' ')[0]} has sent ${used}/${DAILY_CAP} today` });
      }

      await sendTemplateEmail({
        to: lead.email, subject, body, sender, leadId: lead.id,
        idempotencyKey: `template-${lead.id}-${today}`,
      });

      // Log it in Scheduled Outreach (as already sent) so the daily cap and
      // template stats see it, then update the lead's outreach columns.
      await appendRow(TABS.SCHEDULED, [
        genId('sched'), lead.id, lead.businessName, subject, body,
        nowIso, 'sent', nowIso, '', lead.email, 'template', sender.id, templateId,
      ]).catch(err => console.error('[send-template] Log row failed:', err.message));

      await updateRange(TABS.LEADS, `M${lead._row}`, [subject, body]);
      await updateRange(TABS.LEADS, `S${lead._row}`, [
        lead.outreachSentAt || nowIso,
        (lead.outreachCount || 0) + 1,
        nowIso,
      ]);

      console.log(`[send-template] ${sender.id} sent to ${lead.businessName} (${lead.email})`);
      return json(200, { sent: true, used: used + 1, cap: DAILY_CAP });
    }

    // ── Queue a batch for later ───────────────────────────────────
    if (payload.action === 'queue') {
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) return json(400, { error: 'Nothing to queue' });

      const rows = [];
      const skipped = [];
      const added = {}; // date → count added in this request
      const seen = new Set();

      for (const item of items) {
        const lead = leadsById.get(String(item.leadId || ''));
        const sendAt = item.sendAt && !isNaN(new Date(item.sendAt)) ? new Date(item.sendAt).toISOString() : null;
        let reason = seen.has(item.leadId) ? 'Duplicate in this batch' : null;
        reason ||= blockReason(lead, pendingLeadIds) || validateCopy(item.subject, item.body);
        if (!reason && !sendAt) reason = 'Invalid send time';

        if (!reason) {
          const date = ukDate(sendAt);
          const used = (usage[`${sender.id}|${date}`] || 0) + (added[date] || 0);
          if (used >= DAILY_CAP) reason = `Daily limit of ${DAILY_CAP} reached for ${date}`;
          else added[date] = (added[date] || 0) + 1;
        }

        if (reason) {
          skipped.push({ leadId: item.leadId, businessName: lead?.businessName || '', reason });
          continue;
        }
        seen.add(item.leadId);
        rows.push([
          genId('sched'), lead.id, lead.businessName, item.subject, item.body,
          sendAt, 'pending', nowIso, '', lead.email, 'template', sender.id, templateId,
        ]);
      }

      await appendRows(TABS.SCHEDULED, rows);
      console.log(`[send-template] ${sender.id} queued ${rows.length}, skipped ${skipped.length}`);
      return json(200, { queued: rows.length, skipped });
    }

    return json(400, { error: 'Unknown action' });
  } catch (err) {
    console.error('[send-template] error:', err);
    return json(500, { error: err.message });
  }
};
