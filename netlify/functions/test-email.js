const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'RESEND_API_KEY not set' }) };

  const sampleBody = `Dave,

I came across Plumbers Direct Leeds while looking at local tradespeople in Leeds and noticed you don't have a website yet.

A lot of people search for plumbers online before they call — without a website, those enquiries are going straight to your competitors.

I'd be happy to put together a free mockup showing what it could look like, no strings attached.

Best regards,`;

  const html = `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.7; max-width: 600px;">
<p style="white-space: pre-wrap; margin: 0 0 24px 0;">${sampleBody}</p>
<p style="color: #555; font-size: 13px; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 16px; margin: 0 0 32px 0;">
  --<br>
  Ollie Eastham<br>
  Co-Founder &amp; CRO<br>
  +44 7787 447731<br>
  <a href="https://aventrasites.online" style="color: #555; text-decoration: none;">aventrasites.online</a>
</p>
<p style="font-size: 11px; color: #999; margin: 0;">
  <a href="#" style="color: #999;">Unsubscribe</a>
</p>
</div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Ollie <ollie@aventrasites.online>',
      to: ['joe@aventrasites.online'],
      reply_to: ['ollie@aventrasites.online', 'joe@aventrasites.online'],
      subject: 'Getting more plumbing jobs in Leeds',
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { statusCode: 502, headers: HEADERS, body: JSON.stringify({ error: err }) };
  }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ sent: true, to: 'joe@aventrasites.online' }) };
};
