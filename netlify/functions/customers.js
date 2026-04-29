const { TABS, rowToCustomer, getRange, appendRow, genId } = require('./_sheets');

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
      const rows = await getRange(TABS.CUSTOMERS, 'A2:J');
      const customers = rows
        .map((row, i) => rowToCustomer(row, i + 2))
        .filter(c => c.id);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(customers) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const id = genId('C');
      const row = [
        id,
        data.businessName || '',
        data.domain || '',
        data.netlifyUrl || '',
        data.githubFolder || '',
        data.goLiveDate || '',
        data.monthlyFee || '',
        data.status || 'Active',
        data.notes || '',
        data.setupFee || '',
      ];
      await appendRow(TABS.CUSTOMERS, row);
      return { statusCode: 201, headers: HEADERS, body: JSON.stringify({ id }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('customers error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
