const { TABS, rowToScheduled, rowToLead, getRange } = require('./_sheets');

const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

function isToday(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

exports.handler = async () => {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { statusCode: 503, body: 'RESEND_API_KEY not set' };

    const [schedRows, leadRows] = await Promise.all([
      getRange(TABS.SCHEDULED, 'A2:J'),
      getRange(TABS.LEADS, 'A2:W'),
    ]);

    const today = schedRows
      .map((row, i) => rowToScheduled(row, i + 2))
      .filter(s => s.id && s.status === 'sent' && isToday(s.sendAt));

    const openedToday = leadRows
      .map((row, i) => rowToLead(row, i + 2))
      .filter(l => l.id && isToday(l.emailOpenedAt));

    if (today.length === 0 && openedToday.length === 0) {
      console.log('[daily-digest] No emails sent or opened today');
      return { statusCode: 200, body: JSON.stringify({ sent: 0, opened: 0 }) };
    }

    const th = 'padding: 10px 12px; font-size: 11px; color: #64748b; text-align: left; font-weight: 600; text-transform: uppercase;';

    const sentRows = today.map((s, i) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; font-weight: 500;">${i + 1}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b;">${s.businessName}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #475569;">${s.subject}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #64748b;">${s.leadEmail}</td>
        <td style="padding: 10px 12px;">
          <a href="${APP_URL}/leads/${s.leadId}" style="font-size: 12px; color: #2563eb; text-decoration: none;">View →</a>
        </td>
      </tr>`).join('');

    const sentSection = today.length === 0 ? '' : `
        <p style="font-size: 15px; color: #1e293b; margin: 0 0 20px;"><strong>${today.length} email${today.length !== 1 ? 's' : ''}</strong> sent today</p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="${th}">#</th>
              <th style="${th}">Business</th>
              <th style="${th}">Subject</th>
              <th style="${th}">Sent to</th>
              <th style="${th}"></th>
            </tr>
          </thead>
          <tbody>${sentRows}</tbody>
        </table>`;

    const openedRows = openedToday.map((l, i) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; font-weight: 500;">${i + 1}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b;">${l.businessName}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #64748b;">${l.email}</td>
        <td style="padding: 10px 12px;">
          <a href="${APP_URL}/leads/${l.id}" style="font-size: 12px; color: #2563eb; text-decoration: none;">View →</a>
        </td>
      </tr>`).join('');

    const openedSection = openedToday.length === 0 ? '' : `
        <p style="font-size: 15px; color: #1e293b; margin: ${today.length ? '28px' : '0'} 0 20px;"><strong>${openedToday.length} lead${openedToday.length !== 1 ? 's' : ''}</strong> opened your email</p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background: #ecfdf5;">
              <th style="${th}">#</th>
              <th style="${th}">Business</th>
              <th style="${th}">Email</th>
              <th style="${th}"></th>
            </tr>
          </thead>
          <tbody>${openedRows}</tbody>
        </table>`;

    const html = `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background: #1e293b; padding: 24px 32px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Daily outreach digest</h1>
        <p style="color: #94a3b8; margin: 6px 0 0; font-size: 14px;">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <div style="background: #f8fafc; padding: 24px 32px; border: 1px solid #e2e8f0;">
        ${sentSection}
        ${openedSection}
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
        subject: `${today.length} sent · ${openedToday.length} opened — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        html,
      }),
    });

    if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);

    console.log(`[daily-digest] Digest sent — ${today.length} emails, ${openedToday.length} opened`);
    return { statusCode: 200, body: JSON.stringify({ sent: today.length, opened: openedToday.length }) };
  } catch (err) {
    console.error('[daily-digest] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
