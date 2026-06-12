const { TABS, rowToLead, getRange, updateRange, updateCell } = require('./_sheets');

const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:W');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === leadId) {
      return { lead: rowToLead(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

async function sendOpenNotification(lead, leadId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: #16a34a; padding: 24px 32px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Email opened</h1>
      </div>
      <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #0F0F0F; margin-top: 0;">
          <strong>${lead.businessName}</strong> just opened your outreach email.
        </p>
        <table style="font-size: 14px; color: #374151; border-collapse: collapse; width: 100%; margin-bottom: 24px;">
          ${lead.industry ? `<tr><td style="padding: 4px 0; color: #6b7280; width: 120px;">Industry</td><td>${lead.industry}</td></tr>` : ''}
          ${lead.city ? `<tr><td style="padding: 4px 0; color: #6b7280;">City</td><td>${lead.city}</td></tr>` : ''}
          ${lead.email ? `<tr><td style="padding: 4px 0; color: #6b7280;">Email</td><td>${lead.email}</td></tr>` : ''}
          ${lead.phone ? `<tr><td style="padding: 4px 0; color: #6b7280;">Phone</td><td>${lead.phone}</td></tr>` : ''}
          <tr><td style="padding: 4px 0; color: #6b7280;">Sent</td><td>${lead.outreachCount}× · bumped to Priority 1</td></tr>
        </table>
        <a href="${APP_URL}/leads/${leadId}" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px;">
          View in CRM &rarr;
        </a>
      </div>
      <div style="padding: 16px 32px; font-size: 12px; color: #9CA3AF;">
        Sent by Aventra CRM &middot; Email engagement notification
      </div>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Aventra CRM <notifications@aventrasites.online>',
      to: ['joe@aventrasites.online', 'ollie@aventrasites.online'],
      subject: `${lead.businessName} just opened your email`,
      html,
    }),
  });
}

async function handleOpened(data) {
  const leadId = data.tags?.leadId;
  if (!leadId) return;

  const result = await findLead(leadId);
  if (!result) return;

  const { lead, rowNum } = result;
  if (lead.emailOpenedAt) return; // only notify on first open

  const now = new Date().toISOString();

  await updateRange(TABS.LEADS, `V${rowNum}`, [now]);

  console.log(`[resend-webhook] Lead ${leadId} opened email`);

  await sendOpenNotification(lead, leadId).catch(err =>
    console.error('[resend-webhook] Notification email failed:', err)
  );
}

// Stop all future outreach to a lead and record why in their notes.
// Uses the outreachOptedOut column (W) — every send/follow-up path
// already filters on it.
async function killOutreach(leadId, reason) {
  if (!leadId) return;

  const result = await findLead(leadId);
  if (!result) return;

  const { lead, rowNum } = result;
  if (lead.outreachOptedOut === 'Yes') return;

  await updateCell(TABS.LEADS, `W${rowNum}`, 'Yes');

  const stamp = new Date().toISOString().slice(0, 10);
  const note = `${reason} (${stamp}) — outreach stopped`;
  await updateCell(TABS.LEADS, `L${rowNum}`, lead.notes ? `${lead.notes} | ${note}` : note);

  console.log(`[resend-webhook] ${lead.businessName}: ${note}`);
}

async function handleBounced(data) {
  // Only permanent bounces kill the lead — transient ones (mailbox full,
  // greylisting) can recover on the next send.
  const bounceType = data.bounce?.type || 'Undetermined';
  if (bounceType === 'Transient') {
    console.log(`[resend-webhook] Transient bounce for lead ${data.tags?.leadId} — not stopping outreach`);
    return;
  }
  await killOutreach(data.tags?.leadId, `Email bounced (${bounceType.toLowerCase()})`);
}

async function handleComplained(data) {
  await killOutreach(data.tags?.leadId, 'Recipient marked email as spam');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    console.log('[resend-webhook] received:', JSON.stringify(payload, null, 2));

    if (payload.type === 'email.opened') {
      await handleOpened(payload.data);
    } else if (payload.type === 'email.bounced') {
      await handleBounced(payload.data);
    } else if (payload.type === 'email.complained') {
      await handleComplained(payload.data);
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[resend-webhook] error:', err);
    return { statusCode: 400, body: 'Bad Request' };
  }
};
