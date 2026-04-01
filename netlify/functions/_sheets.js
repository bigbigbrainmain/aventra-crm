const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const TABS = {
  LEADS: 'Leads Pipeline',
  NOTES: 'Notes',
  TASKS: 'Tasks',
};

function getClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Lead columns:
// A(0)=ID, B(1)=Business Name, C(2)=Industry, D(3)=City, E(4)=Email,
// F(5)=Phone, G(6)=Website, H(7)=Priority, I(8)=Priority Reason,
// J(9)=Status, K(10)=Date Pitched, L(11)=Notes, M(12)=Subject,
// N(13)=Email Body, O(14)=Calendly Link Sent, P(15)=Is Favourite
function rowToLead(row, rowNum) {
  return {
    id: String(row[0] || ''),
    businessName: String(row[1] || ''),
    industry: String(row[2] || ''),
    city: String(row[3] || ''),
    email: String(row[4] || ''),
    phone: String(row[5] || ''),
    website: String(row[6] || ''),
    priority: String(row[7] || ''),
    priorityReason: String(row[8] || ''),
    status: String(row[9] || 'New'),
    datePitched: String(row[10] || ''),
    notes: String(row[11] || ''),
    subject: String(row[12] || ''),
    emailBody: String(row[13] || ''),
    calendlyLinkSent: String(row[14] || 'No'),
    isFavourite: row[15] === 'TRUE' || row[15] === true,
    _row: rowNum,
  };
}

// Note columns: A(0)=ID, B(1)=Lead ID, C(2)=Note Text, D(3)=Timestamp, E(4)=Actioned
function rowToNote(row, rowNum) {
  return {
    id: String(row[0] || ''),
    leadId: String(row[1] || ''),
    text: String(row[2] || ''),
    timestamp: String(row[3] || ''),
    actioned: row[4] === 'TRUE' || row[4] === true,
    _row: rowNum,
  };
}

// Task columns: A(0)=ID, B(1)=Lead ID, C(2)=Description, D(3)=Due Date, E(4)=Completed, F(5)=Created Date
function rowToTask(row, rowNum) {
  return {
    id: String(row[0] || ''),
    leadId: String(row[1] || ''),
    description: String(row[2] || ''),
    dueDate: String(row[3] || ''),
    completed: row[4] === 'TRUE' || row[4] === true,
    createdDate: String(row[5] || ''),
    _row: rowNum,
  };
}

async function getRange(tab, range) {
  const sheets = getClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!${range}`,
    });
    return res.data.values || [];
  } catch (err) {
    // Tab doesn't exist yet — return empty
    if (err.code === 400 || (err.message && err.message.includes('Unable to parse range'))) {
      return [];
    }
    throw err;
  }
}

async function appendRow(tab, row) {
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

async function updateCell(tab, cellRef, value) {
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!${cellRef}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

async function updateRow(tab, rowNum, values) {
  const sheets = getClient();
  const lastCol = String.fromCharCode(64 + values.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${rowNum}:${lastCol}${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

async function deleteRow(tab, rowNum) {
  const sheets = getClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === tab);
  if (!sheet) throw new Error(`Tab "${tab}" not found`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowNum - 1,
            endIndex: rowNum,
          },
        },
      }],
    },
  });
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

module.exports = {
  SHEET_ID,
  TABS,
  rowToLead,
  rowToNote,
  rowToTask,
  getRange,
  appendRow,
  updateCell,
  updateRow,
  deleteRow,
  genId,
};
