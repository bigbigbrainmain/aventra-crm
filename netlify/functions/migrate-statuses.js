const { getRange, updateCell, TABS } = require('./_sheets');

// Maps old status values in the sheet to new ones
const STATUS_MAP = {
  'Emailed':        'Working',
  'Called':         'Working',
  'In Progress':    'HOT',
  'Live/Paid':      'Closed Won',
  'Not Interested': 'Lost',
};

exports.handler = async () => {
  try {
    const rows = await getRange(TABS.LEADS, 'A2:J10000');
    const updates = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2; // 1-indexed, skip header
      const currentStatus = String(row[9] || '');
      const newStatus = STATUS_MAP[currentStatus];
      if (newStatus) {
        updates.push({ rowNum, from: currentStatus, to: newStatus });
      }
    });

    for (const { rowNum, to } of updates) {
      await updateCell(TABS.LEADS, `J${rowNum}`, to);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Migrated ${updates.length} rows`,
        changes: updates.map(u => `Row ${u.rowNum}: ${u.from} → ${u.to}`),
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
