const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const sheets = getSheets();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const existingTabs = spreadsheet.data.sheets.map(s => s.properties.title);

    const toCreate = [];
    if (!existingTabs.includes('Notes')) toCreate.push('Notes');
    if (!existingTabs.includes('Tasks')) toCreate.push('Tasks');
    if (!existingTabs.includes('Live Customers')) toCreate.push('Live Customers');
    if (!existingTabs.includes('Add-ons')) toCreate.push('Add-ons');
    if (!existingTabs.includes('Customer Add-ons')) toCreate.push('Customer Add-ons');

    if (toCreate.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: toCreate.map(title => ({ addSheet: { properties: { title } } })),
        },
      });

      const headerUpdates = [];
      if (toCreate.includes('Notes')) {
        headerUpdates.push(sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: 'Notes!A1:E1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['ID', 'Lead ID', 'Note Text', 'Timestamp', 'Actioned']] },
        }));
      }
      if (toCreate.includes('Tasks')) {
        headerUpdates.push(sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: 'Tasks!A1:F1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['ID', 'Lead ID', 'Description', 'Due Date', 'Completed', 'Created Date']] },
        }));
      }
      if (toCreate.includes('Live Customers')) {
        headerUpdates.push(sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: 'Live Customers!A1:I1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['ID', 'Business Name', 'Domain', 'Netlify URL', 'GitHub Folder', 'Go Live Date', 'Monthly Fee', 'Status', 'Notes']] },
        }));
      }
      if (toCreate.includes('Add-ons')) {
        headerUpdates.push(sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: 'Add-ons!A1:F1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['ID', 'Name', 'Description', 'One-off Fee', 'Monthly Fee', 'Active']] },
        }));
      }
      if (toCreate.includes('Customer Add-ons')) {
        headerUpdates.push(sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: 'Customer Add-ons!A1:G1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['ID', 'Customer ID', 'Addon ID', 'Custom Monthly Fee', 'Custom One-off Fee', 'Start Date', 'Notes']] },
        }));
      }
      await Promise.all(headerUpdates);
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        success: true,
        created: toCreate,
        message: toCreate.length > 0
          ? `Created sheets: ${toCreate.join(', ')}`
          : 'All required sheets already exist',
      }),
    };
  } catch (err) {
    console.error('setup error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
