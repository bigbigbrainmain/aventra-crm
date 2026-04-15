export const handler = async () => {
  const apiKey = process.env.RESEND_API_KEY || 're_BmJGYvCk_NRHFtQr2WAd3ZRfDsUvm1iFi';

  const MONTHLY_LIMIT = 3000;
  const DAILY_LIMIT = 100;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  try {
    let monthlyCount = 0;
    let dailyCount = 0;
    let offset = 0;
    const limit = 100;
    let keepFetching = true;

    while (keepFetching) {
      const res = await fetch(`https://api.resend.com/emails?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) break;

      const data = await res.json();
      const emails = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

      if (emails.length === 0) break;

      for (const email of emails) {
        const createdAt = email.created_at;
        if (!createdAt) continue;

        if (createdAt >= monthStart) {
          monthlyCount++;
          if (createdAt >= dayStart) dailyCount++;
        } else {
          // Emails sorted newest-first — once we pass month start, stop paginating
          keepFetching = false;
          break;
        }
      }

      if (emails.length < limit) keepFetching = false;
      offset += limit;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        monthly: { used: monthlyCount, limit: MONTHLY_LIMIT },
        daily: { used: dailyCount, limit: DAILY_LIMIT },
      }),
    };
  } catch (err) {
    console.error('email-usage error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch email usage' }),
    };
  }
};
