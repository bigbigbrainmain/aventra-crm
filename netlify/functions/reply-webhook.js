const { TABS, rowToLead, getRange, updateRange } = require('./_sheets');

const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:X');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === leadId) {
      return { lead: rowToLead(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

// Extract leadId from any plus-addressed recipient, e.g.
// ollie+{leadId}@aventrasites.online or reply+{leadId}@aventrasites.online
function parseLeadId(toAddress) {
  const match = String(toAddress || '').match(/\+([^@+\s]+)@/);
  return match ? match[1] : null;
}

async function sendReplyNotification(lead, leadId, fromEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px;">
    <div style="background: #16a34a; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 22px;">🔥 Reply received — call them now</h1>
    </div>
    <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
      <p style="font-size: 16px; color: #0F0F0F; margin-top: 0;">
        <strong>${lead.businessName}</strong> replied to your outreach email.
      </p>
      <table style="font-size: 14px; color: #374151; border-collapse: collapse; width: 100%; margin-bottom: 24px;">
        ${lead.industry ? `<tr><td style="padding: 4px 0; color: #6b7280; width: 120px;">Industry</td><td>${lead.industry}</td></tr>` : ''}
        ${lead.city ? `<tr><td style="padding: 4px 0; color: #6b7280;">City</td><td>${lead.city}</td></tr>` : ''}
        ${lead.phone ? `<tr><td style="padding: 4px 0; color: #6b7280;">Phone</td><td><strong>${lead.phone}</strong></td></tr>` : ''}
        <tr><td style="padding: 4px 0; color: #6b7280;">Replied from</td><td>${fromEmail}</td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Emails sent</td><td>${lead.outreachCount}×</td></tr>
      </table>
      <a href="${APP_URL}/prime-leads" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; display: inline-block;">
        View Prime Leads →
      </a>
    </div>
  </div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Aventra CRM <notifications@aventrasites.online>',
      to: ['joe@aventrasites.online', 'ollie@aventrasites.online'],
      subject: `🔥 ${lead.businessName} replied — call them`,
      html,
    }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const body = JSON.parse(event.body || '{}');
    console.log('[reply-webhook] received:', JSON.stringify(body));

    // Support both Cloudflare Email Workers format and direct POST
    const to = body.to || body.To || '';
    const from = body.from || body.From || '';

    const leadId = parseLeadId(to);
    if (!leadId) {
      console.log('[reply-webhook] Could not parse leadId from:', to);
      return { statusCode: 200, body: 'ok' };
    }

    const result = await findLead(leadId);
    if (!result) {
      console.log('[reply-webhook] Lead not found:', leadId);
      return { statusCode: 200, body: 'ok' };
    }

    const { lead, rowNum } = result;

    // Only process first reply
    if (lead.status === 'Replied') {
      console.log('[reply-webhook] Already marked replied:', leadId);
      return { statusCode: 200, body: 'ok' };
    }

    // Update status to Replied (col J = index 9)
    await updateRange(TABS.LEADS, `J${rowNum}`, ['Replied']);
    console.log(`[reply-webhook] Marked ${lead.businessName} as Replied`);

    await sendReplyNotification(lead, leadId, from).catch(err =>
      console.error('[reply-webhook] Notification failed:', err)
    );

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[reply-webhook] Error:', err);
    return { statusCode: 400, body: 'Bad Request' };
  }
};
