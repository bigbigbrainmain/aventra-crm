const { TABS, rowToTask, getRange, updateCell, deleteRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
};

async function findTask(taskId) {
  const rows = await getRange(TABS.TASKS, 'A2:F');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === taskId) {
      return { task: rowToTask(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const taskId = (event.queryStringParameters || {}).id;
  if (!taskId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

  try {
    if (event.httpMethod === 'PATCH') {
      const result = await findTask(taskId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };

      const data = JSON.parse(event.body || '{}');
      const { rowNum, task } = result;

      if (data.completed !== undefined) {
        await updateCell(TABS.TASKS, `E${rowNum}`, data.completed ? 'TRUE' : 'FALSE');
      }
      if (data.description !== undefined) {
        await updateCell(TABS.TASKS, `C${rowNum}`, data.description);
      }
      if (data.dueDate !== undefined) {
        await updateCell(TABS.TASKS, `D${rowNum}`, data.dueDate);
      }

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ...task, ...data }) };
    }

    if (event.httpMethod === 'DELETE') {
      const result = await findTask(taskId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      await deleteRow(TABS.TASKS, result.rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('task error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
