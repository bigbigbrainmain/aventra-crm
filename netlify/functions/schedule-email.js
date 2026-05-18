const { TABS, rowToScheduled, getRange, appendRow, updateRow, deleteRow, genId, ensureTab } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const TAB_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email'];

async function findScheduled(id) {
  const rows = await getRange(TABS.SCHEDULED, 'A2:J');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      return { item: rowToScheduled(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  try {
    await ensureTab(TABS.SCHEDULED, TAB_HEADERS);

    if (event.httpMethod === 'GET') {
      const rows = await getRange(TABS.SCHEDULED, 'A2:J');
      const items = rows.map((row, i) => rowToScheduled(row, i + 2)).filter(s => s.id);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(items) };
    }

    if (event.httpMethod === 'POST') {
      const { leadId, businessName, subject, body, sendAt, leadEmail } = JSON.parse(event.body || '{}');
      if (!leadId || !subject || !body || !sendAt) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing required fields: leadId, subject, body, sendAt' }) };
      }
      const id = genId('sched');
      const now = new Date().toISOString();
      await appendRow(TABS.SCHEDULED, [id, leadId, businessName || '', subject, body, sendAt, 'pending', now, '', leadEmail || '']);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ id, leadId, businessName, subject, body, sendAt, status: 'pending', createdAt: now }) };
    }

    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

    const result = await findScheduled(id);
    if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Scheduled email not found' }) };

    const { item, rowNum } = result;

    if (event.httpMethod === 'PATCH') {
      const updates = JSON.parse(event.body || '{}');
      const allowed = ['subject', 'body', 'sendAt', 'status', 'error'];
      const merged = { ...item };
      for (const key of allowed) {
        if (updates[key] !== undefined) merged[key] = updates[key];
      }
      await updateRow(TABS.SCHEDULED, rowNum, [
        merged.id, merged.leadId, merged.businessName, merged.subject,
        merged.body, merged.sendAt, merged.status, merged.createdAt,
        merged.error, merged.leadEmail,
      ]);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(merged) };
    }

    if (event.httpMethod === 'DELETE') {
      await deleteRow(TABS.SCHEDULED, rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ deleted: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('[schedule-email] error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
