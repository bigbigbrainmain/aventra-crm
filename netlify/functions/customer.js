const { TABS, rowToCustomer, getRange, updateRow, deleteRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
};

async function findCustomer(customerId) {
  const rows = await getRange(TABS.CUSTOMERS, 'A2:J');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === customerId) {
      return { customer: rowToCustomer(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const customerId = (event.queryStringParameters || {}).id;
  if (!customerId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

  try {
    if (event.httpMethod === 'GET') {
      const result = await findCustomer(customerId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(result.customer) };
    }

    if (event.httpMethod === 'PATCH') {
      const result = await findCustomer(customerId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };

      const updates = JSON.parse(event.body || '{}');
      const updated = { ...result.customer, ...updates };
      const row = [
        updated.id,
        updated.businessName,
        updated.domain,
        updated.netlifyUrl,
        updated.githubFolder,
        updated.goLiveDate,
        updated.monthlyFee,
        updated.status,
        updated.notes,
        updated.setupFee || '',
      ];
      await updateRow(TABS.CUSTOMERS, result.rowNum, row);
      const { _row, ...clean } = updated;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(clean) };
    }

    if (event.httpMethod === 'DELETE') {
      const result = await findCustomer(customerId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      await deleteRow(TABS.CUSTOMERS, result.rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('customer error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
