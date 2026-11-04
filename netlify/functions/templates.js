// Saved email templates for Outreach > Bulk send.
//
// GET                → [{ id, name, sender, subject, body, ..., stats }]
// POST {name, sender, subject, body}            → create
// PATCH ?id=  {name?, sender?, subject?, body?} → update
// DELETE ?id=                                   → delete
//
// stats are worked out from the Scheduled Outreach log, so you can compare
// templates (A/B test): sent, queued, opened, replied.
//   opened  = lead's open timestamp is after this template's send
//   replied = lead is marked Replied and this was the last template it got
// Both are approximate — opens rely on the tracking pixel loading.

const { TABS, rowToTemplate, rowToScheduled, rowToLead, getRange, appendRow, updateRow, deleteRow, ensureTab, genId } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};
const TAB_HEADERS = ['ID', 'Name', 'Sender', 'Subject', 'Body', 'Created At', 'Updated At'];
const SENDERS = new Set(['joe', 'ollie']);

const json = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });

function computeStats(templates, scheduled, leadsById) {
  const stats = Object.fromEntries(templates.map(t => [t.id, { sent: 0, queued: 0, opened: 0, replied: 0 }]));
  const rows = scheduled.filter(s => s.type === 'template' && stats[s.templateId]);

  // Last template row actually sent to each lead — a reply is credited to that
  const lastSent = new Map();
  for (const s of rows) {
    if (s.status !== 'sent') continue;
    const prev = lastSent.get(s.leadId);
    if (!prev || new Date(s.sendAt) > new Date(prev.sendAt)) lastSent.set(s.leadId, s);
  }

  for (const s of rows) {
    const st = stats[s.templateId];
    if (s.status === 'pending') { st.queued++; continue; }
    if (s.status !== 'sent') continue;
    st.sent++;
    const lead = leadsById.get(s.leadId);
    if (!lead) continue;
    if (lead.emailOpenedAt && new Date(lead.emailOpenedAt) >= new Date(s.sendAt)) st.opened++;
    if (lead.status === 'Replied' && lastSent.get(s.leadId) === s) st.replied++;
  }
  return stats;
}

async function findTemplate(id) {
  const rows = await getRange(TABS.TEMPLATES, 'A2:G');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === id) return rowToTemplate(rows[i], i + 2);
  }
  return null;
}

function clean(data) {
  const out = {};
  if (data.name !== undefined) out.name = String(data.name).trim().slice(0, 120);
  if (data.sender !== undefined) {
    if (!SENDERS.has(data.sender)) throw Object.assign(new Error('Sender must be joe or ollie'), { status: 400 });
    out.sender = data.sender;
  }
  if (data.subject !== undefined) out.subject = String(data.subject);
  if (data.body !== undefined) out.body = String(data.body);
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  try {
    await ensureTab(TABS.TEMPLATES, TAB_HEADERS);

    if (event.httpMethod === 'GET') {
      const [tplRows, schedRows, leadRows] = await Promise.all([
        getRange(TABS.TEMPLATES, 'A2:G'),
        getRange(TABS.SCHEDULED, 'A2:M'),
        getRange(TABS.LEADS, 'A2:X'),
      ]);
      const templates = tplRows.map((r, i) => rowToTemplate(r, i + 2)).filter(t => t.id);
      const scheduled = schedRows.map((r, i) => rowToScheduled(r, i + 2));
      const leadsById = new Map(leadRows.map((r, i) => rowToLead(r, i + 2)).map(l => [l.id, l]));
      const stats = computeStats(templates, scheduled, leadsById);
      return json(200, templates.map(({ _row, ...t }) => ({ ...t, stats: stats[t.id] })));
    }

    if (event.httpMethod === 'POST') {
      const data = clean(JSON.parse(event.body || '{}'));
      if (!data.name) return json(400, { error: 'Give the template a name' });
      const now = new Date().toISOString();
      const t = {
        id: genId('tpl'), name: data.name, sender: data.sender || 'joe',
        subject: data.subject || '', body: data.body || '', createdAt: now, updatedAt: now,
      };
      await appendRow(TABS.TEMPLATES, [t.id, t.name, t.sender, t.subject, t.body, t.createdAt, t.updatedAt]);
      return json(200, { ...t, stats: { sent: 0, queued: 0, opened: 0, replied: 0 } });
    }

    const id = event.queryStringParameters?.id;
    if (!id) return json(400, { error: 'Missing id' });
    const existing = await findTemplate(id);
    if (!existing) return json(404, { error: 'Template not found' });

    if (event.httpMethod === 'PATCH') {
      const merged = { ...existing, ...clean(JSON.parse(event.body || '{}')), updatedAt: new Date().toISOString() };
      await updateRow(TABS.TEMPLATES, existing._row, [
        merged.id, merged.name, merged.sender, merged.subject, merged.body, merged.createdAt, merged.updatedAt,
      ]);
      const { _row, ...t } = merged;
      return json(200, t);
    }

    if (event.httpMethod === 'DELETE') {
      await deleteRow(TABS.TEMPLATES, existing._row);
      return json(200, { deleted: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[templates] error:', err);
    return json(err.status || 500, { error: err.message });
  }
};
