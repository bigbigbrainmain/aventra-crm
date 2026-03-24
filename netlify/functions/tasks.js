const { TABS, rowToTask, getRange, appendRow, genId } = require('./_sheets');

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
      const rows = await getRange(TABS.TASKS, 'A2:F');
      let tasks = rows
        .map((row, i) => rowToTask(row, i + 2))
        .filter(t => t.id);

      if (leadId) tasks = tasks.filter(t => t.leadId === leadId);

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(tasks) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      if (!data.leadId || !data.description) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'leadId and description required' }) };
      }
      const id = genId('T');
      const now = new Date().toISOString();
      await appendRow(TABS.TASKS, [id, data.leadId, data.description, data.dueDate || '', 'FALSE', now]);
      return {
        statusCode: 201,
        headers: HEADERS,
        body: JSON.stringify({ id, leadId: data.leadId, description: data.description, dueDate: data.dueDate || '', completed: false, createdDate: now }),
      };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('tasks error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
