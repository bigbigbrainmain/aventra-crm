export const handler = async (event) => {
    const apiKey = process.env.RESEND_API_KEY || 're_BmJGYvCk_NRHFtQr2WAd3ZRfDsUvm1iFi';

    const params = event.queryStringParameters || {};
    const siteName = params.name || 'Unknown Client';
    const siteUrl = params.url || '';

    const now = new Date().toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        dateStyle: 'full',
        timeStyle: 'short'
    });
    const referrer = event.headers['referer'] || 'Direct visit';
    const userAgent = event.headers['user-agent'] || 'Unknown';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
            <div style="background: #DC2626; padding: 24px 32px;">
                <h1 style="color: white; margin: 0; font-size: 22px;">&#128064; Proposal Viewed</h1>
            </div>
            <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
                <p style="font-size: 18px; font-weight: bold; color: #0F0F0F; margin-top: 0;">
                    Someone just viewed the <strong>${siteName}</strong> proposal.
                </p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #6B7280; font-size: 14px; width: 120px;">Time</td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600;">${now}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #6B7280; font-size: 14px;">Proposal URL</td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px;"><a href="${siteUrl}" style="color: #DC2626;">${siteUrl}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #6B7280; font-size: 14px;">Referred from</td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${referrer}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; color: #6B7280; font-size: 14px;">Device</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #9CA3AF;">${userAgent}</td>
                    </tr>
                </table>
                <div style="margin-top: 28px;">
                    <a href="${siteUrl}" style="background: #DC2626; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px;">View Proposal &rarr;</a>
                </div>
            </div>
            <div style="padding: 16px 32px; font-size: 12px; color: #9CA3AF;">
                Sent by Aventra Sites &middot; Proposal notification system
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
                from: 'Aventra Proposals <notifications@aventrasites.online>',
                to: ['joe@aventrasites.online', 'ollie@aventrasites.online'],
                subject: `Proposal Viewed - ${siteName}`,
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
