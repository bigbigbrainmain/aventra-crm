const { TABS, rowToScheduled, getRange } = require('./_sheets');

const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

function isToday(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

exports.handler = async () => {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { statusCode: 503, body: 'RESEND_API_KEY not set' };

    const rows = await getRange(TABS.SCHEDULED, 'A2:J');
    const today = rows
      .map((row, i) => rowToScheduled(row, i + 2))
      .filter(s => s.id && s.status === 'sent' && isToday(s.sendAt));

    if (today.length === 0) {
      console.log('[daily-digest] No emails sent today');
      return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
    }

    const rows_html = today.map((s, i) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; font-weight: 500;">${i + 1}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b;">${s.businessName}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #475569;">${s.subject}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #64748b;">${s.leadEmail}</td>
        <td style="padding: 10px 12px;">
          <a href="${APP_URL}/leads/${s.leadId}" style="font-size: 12px; color: #2563eb; text-decoration: none;">View →</a>
        </td>
      </tr>`).join('');

    const html = `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background: #1e293b; padding: 24px 32px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Daily outreach digest</h1>
        <p style="color: #94a3b8; margin: 6px 0 0; font-size: 14px;">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <div style="background: #f8fafc; padding: 24px 32px; border: 1px solid #e2e8f0;">
        <p style="font-size: 15px; color: #1e293b; margin: 0 0 20px;"><strong>${today.length} email${today.length !== 1 ? 's' : ''}</strong> sent today</p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 10px 12px; font-size: 11px; color: #64748b; text-align: left; font-weight: 600; text-transform: uppercase;">#</th>
              <th style="padding: 10px 12px; font-size: 11px; color: #64748b; text-align: left; font-weight: 600; text-transform: uppercase;">Business</th>
              <th style="padding: 10px 12px; font-size: 11px; color: #64748b; text-align: left; font-weight: 600; text-transform: uppercase;">Subject</th>
              <th style="padding: 10px 12px; font-size: 11px; color: #64748b; text-align: left; font-weight: 600; text-transform: uppercase;">Sent to</th>
              <th style="padding: 10px 12px; font-size: 11px; color: #64748b; text-align: left; font-weight: 600; text-transform: uppercase;"></th>
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
        <div style="margin-top: 24px;">
          <a href="${APP_URL}/prime-leads" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; display: inline-block;">Check Prime Leads →</a>
        </div>
      </div>
      <div style="padding: 16px 32px; font-size: 12px; color: #94a3b8;">Aventra CRM · Daily digest · Sent at 6pm</div>
    </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Aventra CRM <notifications@aventrasites.online>',
        to: ['joe@aventrasites.online'],
        subject: `${today.length} email${today.length !== 1 ? 's' : ''} sent today — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        html,
      }),
    });

    if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);

    console.log(`[daily-digest] Digest sent — ${today.length} emails`);
    return { statusCode: 200, body: JSON.stringify({ sent: today.length }) };
  } catch (err) {
    console.error('[daily-digest] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
