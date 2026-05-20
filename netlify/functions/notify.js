const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS, body: '' };
    }

    const apiKey = process.env.RESEND_API_KEY || 're_BmJGYvCk_NRHFtQr2WAd3ZRfDsUvm1iFi';

    let name, email, proposal, durationSecs;
    try {
        ({ name, email, proposal, duration: durationSecs } = JSON.parse(event.body || '{}'));
    } catch {
        return { statusCode: 400, headers: CORS, body: 'Invalid JSON' };
    }

    if (!name || !email || !proposal) {
        return { statusCode: 400, headers: CORS, body: 'Missing name, email or proposal' };
    }

    durationSecs = parseInt(durationSecs, 10) || 0;
    const durationLabel = durationSecs < 60
        ? `${durationSecs} sec`
        : `${Math.floor(durationSecs / 60)} min ${durationSecs % 60} sec`;

    const siteUrl = `https://aventra-${proposal}.netlify.app`;
    const siteName = proposal.charAt(0).toUpperCase() + proposal.slice(1);

    const now = new Date().toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        dateStyle: 'full',
        timeStyle: 'short',
    });
    const userAgent = event.headers['user-agent'] || 'Unknown';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
            <div style="background: #DC2626; padding: 24px 32px;">
                <h1 style="color: white; margin: 0; font-size: 22px;">&#128064; Proposal Viewed</h1>
            </div>
            <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
                <p style="font-size: 18px; font-weight: bold; color: #0F0F0F; margin-top: 0;">
                    ${name} just viewed the <strong>${siteName}</strong> proposal.
                </p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #6B7280; font-size: 14px; width: 120px;">Name</td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600;">${name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #6B7280; font-size: 14px;">Email</td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600;">
                            <a href="mailto:${email}" style="color: #DC2626;">${email}</a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #6B7280; font-size: 14px;">Time spent</td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600;">${durationLabel}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #6B7280; font-size: 14px;">Time</td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${now}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #6B7280; font-size: 14px;">Proposal</td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px;">
                            <a href="${siteUrl}" style="color: #DC2626;">${siteUrl}</a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; color: #6B7280; font-size: 14px;">Device</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #9CA3AF;">${userAgent}</td>
                    </tr>
                </table>
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
                subject: `${name} viewed ${siteName} (${durationLabel})`,
                html,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Resend error:', err);
            return { statusCode: 500, headers: CORS, body: 'Email failed' };
        }

        return { statusCode: 200, headers: CORS, body: 'OK' };
    } catch (err) {
        console.error('Function error:', err);
        return { statusCode: 500, headers: CORS, body: 'Error' };
    }
};
