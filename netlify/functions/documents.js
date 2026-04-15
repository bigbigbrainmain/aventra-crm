const { TABS, rowToDocument, getRange, appendRow, genId } = require('./_sheets');

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
      const rows = await getRange(TABS.DOCUMENTS, 'A2:F');
      const documents = rows
        .map((row, i) => rowToDocument(row, i + 2))
        .filter(d => d.id);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(documents) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const id = genId('D');
      const addedDate = new Date().toISOString().split('T')[0];
      const row = [
        id,
        data.title || '',
        data.url || '',
        data.category || 'General',
        data.description || '',
        addedDate,
      ];
      await appendRow(TABS.DOCUMENTS, row);
      return { statusCode: 201, headers: HEADERS, body: JSON.stringify({ id }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('documents error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
