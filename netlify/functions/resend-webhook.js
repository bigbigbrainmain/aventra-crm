export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    console.log('[resend-webhook] received:', JSON.stringify(payload, null, 2));

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[resend-webhook] parse error:', err);
    return { statusCode: 400, body: 'Bad Request' };
  }
};
