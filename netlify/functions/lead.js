const { TABS, rowToLead, getRange, updateRow, deleteRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
};

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:O');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === leadId) {
      return { lead: rowToLead(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const leadId = (event.queryStringParameters || {}).id;
  if (!leadId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

  try {
    if (event.httpMethod === 'GET') {
      const result = await findLead(leadId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(result.lead) };
    }

    if (event.httpMethod === 'PATCH') {
      const result = await findLead(leadId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };

      const updates = JSON.parse(event.body || '{}');
      const updated = { ...result.lead, ...updates };
      const row = [
        updated.id,
        updated.businessName,
        updated.industry,
        updated.city,
        updated.email,
        updated.phone,
        updated.website,
        updated.priority,
        updated.priorityReason,
        updated.status,
        updated.datePitched,
        updated.notes,
        updated.subject,
        updated.emailBody,
        updated.calendlyLinkSent,
      ];
      await updateRow(TABS.LEADS, result.rowNum, row);
      // Return without _row
      const { _row, ...clean } = updated;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(clean) };
    }

    if (event.httpMethod === 'DELETE') {
      const result = await findLead(leadId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      await deleteRow(TABS.LEADS, result.rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('lead error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
