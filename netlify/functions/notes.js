const { TABS, rowToNote, getRange, appendRow, genId } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  try {
    if (event.httpMethod === 'GET') {
      const leadId = (event.queryStringParameters || {}).leadId;
      const rows = await getRange(TABS.NOTES, 'A2:E');
      let notes = rows
        .map((row, i) => rowToNote(row, i + 2))
        .filter(n => n.id);

      if (leadId) notes = notes.filter(n => n.leadId === leadId);

      notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(notes) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      if (!data.leadId || !data.text) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'leadId and text required' }) };
      }
      const id = genId('N');
      const timestamp = new Date().toISOString();
      await appendRow(TABS.NOTES, [id, data.leadId, data.text, timestamp, 'FALSE']);
      return {
        statusCode: 201,
        headers: HEADERS,
        body: JSON.stringify({ id, leadId: data.leadId, text: data.text, timestamp, actioned: false }),
      };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('notes error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
