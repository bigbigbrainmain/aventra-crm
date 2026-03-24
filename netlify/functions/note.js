const { TABS, rowToNote, getRange, updateCell, deleteRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
};

async function findNote(noteId) {
  const rows = await getRange(TABS.NOTES, 'A2:E');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === noteId) {
      return { note: rowToNote(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const noteId = (event.queryStringParameters || {}).id;
  if (!noteId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

  try {
    if (event.httpMethod === 'PATCH') {
      const result = await findNote(noteId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      const newActioned = !result.note.actioned;
      await updateCell(TABS.NOTES, `E${result.rowNum}`, newActioned ? 'TRUE' : 'FALSE');
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ actioned: newActioned }) };
    }

    if (event.httpMethod === 'DELETE') {
      const result = await findNote(noteId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      await deleteRow(TABS.NOTES, result.rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('note error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
