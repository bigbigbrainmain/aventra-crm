const { TABS, rowToDocument, getRange, updateRow, deleteRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
};

async function findDocument(documentId) {
  const rows = await getRange(TABS.DOCUMENTS, 'A2:F');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === documentId) {
      return { document: rowToDocument(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const documentId = (event.queryStringParameters || {}).id;
  if (!documentId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

  try {
    if (event.httpMethod === 'PATCH') {
      const result = await findDocument(documentId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };

      const updates = JSON.parse(event.body || '{}');
      const updated = { ...result.document, ...updates };
      const row = [
        updated.id,
        updated.title,
        updated.url,
        updated.category,
        updated.description,
        updated.addedDate,
      ];
      await updateRow(TABS.DOCUMENTS, result.rowNum, row);
      const { _row, ...clean } = updated;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(clean) };
    }

    if (event.httpMethod === 'DELETE') {
      const result = await findDocument(documentId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      await deleteRow(TABS.DOCUMENTS, result.rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('document error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
