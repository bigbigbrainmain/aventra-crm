const { TABS, rowToCustomerAddon, getRange, appendRow, genId } = require('./_sheets');

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
      const rows = await getRange(TABS.CUSTOMER_ADDONS, 'A2:G');
      let records = rows
        .map((row, i) => rowToCustomerAddon(row, i + 2))
        .filter(r => r.id);

      const customerId = (event.queryStringParameters || {}).customerId;
      if (customerId) {
        records = records.filter(r => r.customerId === customerId);
      }

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(records) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const id = genId('CA');
      const row = [
        id,
        data.customerId || '',
        data.addonId || '',
        data.customMonthlyFee || '',
        data.customOneOffFee || '',
        data.startDate || '',
        data.notes || '',
      ];
      await appendRow(TABS.CUSTOMER_ADDONS, row);
      return { statusCode: 201, headers: HEADERS, body: JSON.stringify({ id }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('customer-addons error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
