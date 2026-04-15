export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.RESEND_API_KEY || 're_BmJGYvCk_NRHFtQr2WAd3ZRfDsUvm1iFi';

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { toEmail, toName, fromName, entityName, messageBody, deepLink } = body;

  if (!toEmail || !fromName || !messageBody) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const highlightedBody = messageBody.replace(
    /@(\w+)/g,
    '<strong style="color:#2563EB;">@$1</strong>'
  );

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: #2563EB; padding: 24px 32px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">💬 You were mentioned</h1>
      </div>
      <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #0F0F0F; margin-top: 0;">
          <strong>${fromName}</strong> mentioned you in a thread${entityName ? ` on <strong>${entityName}</strong>` : ''}.
        </p>
        <div style="background: white; border-left: 3px solid #2563EB; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">${highlightedBody}</p>
        </div>
        ${deepLink ? `
        <div style="margin-top: 24px;">
          <a href="${deepLink}" style="background: #2563EB; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px;">
            View Thread &rarr;
          </a>
        </div>
        ` : ''}
      </div>
      <div style="padding: 16px 32px; font-size: 12px; color: #9CA3AF;">
        Sent by Aventra CRM &middot; Internal notification
      </div>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Aventra CRM <notifications@aventrasites.online>',
        to: [toEmail],
        subject: `${fromName} mentioned you${entityName ? ` on ${entityName}` : ''}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { statusCode: 500, body: 'Email failed' };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'OK',
    };
  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, body: 'Error' };
  }
};
