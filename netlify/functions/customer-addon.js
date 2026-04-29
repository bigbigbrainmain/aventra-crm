const { TABS, rowToCustomerAddon, getRange, updateRow, deleteRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
};

async function findCustomerAddon(recordId) {
  const rows = await getRange(TABS.CUSTOMER_ADDONS, 'A2:G');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === recordId) {
      return { record: rowToCustomerAddon(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const recordId = (event.queryStringParameters || {}).id;
  if (!recordId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

  try {
    if (event.httpMethod === 'PATCH') {
      const result = await findCustomerAddon(recordId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };

      const updates = JSON.parse(event.body || '{}');
      const updated = { ...result.record, ...updates };
      const row = [
        updated.id,
        updated.customerId,
        updated.addonId,
        updated.customMonthlyFee,
        updated.customOneOffFee,
        updated.startDate,
        updated.notes,
      ];
      await updateRow(TABS.CUSTOMER_ADDONS, result.rowNum, row);
      const { _row, ...clean } = updated;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(clean) };
    }

    if (event.httpMethod === 'DELETE') {
      const result = await findCustomerAddon(recordId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      await deleteRow(TABS.CUSTOMER_ADDONS, result.rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('customer-addon error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
