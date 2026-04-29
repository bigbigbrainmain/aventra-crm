const { TABS, rowToAddon, getRange, appendRow, genId } = require('./_sheets');

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
      const rows = await getRange(TABS.ADDONS, 'A2:F');
      const addons = rows
        .map((row, i) => rowToAddon(row, i + 2))
        .filter(a => a.id);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(addons) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const id = genId('AO');
      const row = [
        id,
        data.name || '',
        data.description || '',
        data.oneOffFee || '',
        data.monthlyFee || '',
        data.active !== false ? 'TRUE' : 'FALSE',
      ];
      await appendRow(TABS.ADDONS, row);
      return { statusCode: 201, headers: HEADERS, body: JSON.stringify({ id }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('addons error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
