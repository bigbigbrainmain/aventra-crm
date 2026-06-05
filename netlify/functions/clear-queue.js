const { TABS, rowToScheduled, getRange, deleteRow } = require('./_sheets');

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async () => {
  try {
    const rows = await getRange(TABS.SCHEDULED, 'A2:J');
    const pending = rows
      .map((row, i) => ({ item: rowToScheduled(row, i + 2), rowNum: i + 2 }))
      .filter(({ item }) => item.id && item.status === 'pending')
      .reverse(); // delete from bottom up to preserve row numbers

    for (const { rowNum } of pending) {
      await deleteRow(TABS.SCHEDULED, rowNum);
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ deleted: pending.length }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
