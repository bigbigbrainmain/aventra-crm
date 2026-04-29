const { TABS, rowToAddon, getRange, updateRow, deleteRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
};

async function findAddon(addonId) {
  const rows = await getRange(TABS.ADDONS, 'A2:F');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === addonId) {
      return { addon: rowToAddon(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const addonId = (event.queryStringParameters || {}).id;
  if (!addonId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

  try {
    if (event.httpMethod === 'GET') {
      const result = await findAddon(addonId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(result.addon) };
    }

    if (event.httpMethod === 'PATCH') {
      const result = await findAddon(addonId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };

      const updates = JSON.parse(event.body || '{}');
      const updated = { ...result.addon, ...updates };
      const row = [
        updated.id,
        updated.name,
        updated.description,
        updated.oneOffFee,
        updated.monthlyFee,
        updated.active !== false ? 'TRUE' : 'FALSE',
      ];
      await updateRow(TABS.ADDONS, result.rowNum, row);
      const { _row, ...clean } = updated;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(clean) };
    }

    if (event.httpMethod === 'DELETE') {
      const result = await findAddon(addonId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      await deleteRow(TABS.ADDONS, result.rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('addon error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
