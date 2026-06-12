const { TABS, getRange, updateCell } = require('./_sheets');

function htmlPage(heading, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 40px 16px;">
<div style="max-width: 480px; margin: 0 auto; background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px; text-align: center;">
  <h1 style="font-size: 20px; color: #0F0F0F; margin: 0 0 12px;">${heading}</h1>
  <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0;">${message}</p>
</div>
</body>
</html>`;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };

  const leadId = event.queryStringParameters && event.queryStringParameters.id;
  if (!leadId) {
    return {
      statusCode: 400,
      headers,
      body: htmlPage('Something went wrong', 'This unsubscribe link is missing its ID. Reply to the email instead and we will take you off the list.'),
    };
  }

  try {
    const rows = await getRange(TABS.LEADS, 'A2:A');
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === leadId) {
        // Col W = outreachOptedOut
        await updateCell(TABS.LEADS, `W${i + 2}`, 'Yes');
        break;
      }
    }
  } catch (err) {
    console.error('[outreach-unsubscribe] Error:', err);
    return {
      statusCode: 500,
      headers,
      body: htmlPage('Something went wrong', 'We could not process that just now. Reply to the email instead and we will take you off the list.'),
    };
  }

  // Always confirm success to the visitor, even if the lead ID was not found —
  // an unknown ID has nothing to unsubscribe anyway.
  return {
    statusCode: 200,
    headers,
    body: htmlPage("You're unsubscribed", "Sorry to have bothered you — you won't hear from us again."),
  };
};
