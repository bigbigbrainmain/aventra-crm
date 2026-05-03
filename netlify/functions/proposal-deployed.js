const { TABS, rowToLead, getRange, updateRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const secret = event.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.PROPOSAL_WEBHOOK_SECRET) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { folderName, siteUrl } = body;
  if (!folderName || !siteUrl) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing folderName or siteUrl' }) };
  }

  try {
    const rows = await getRange(TABS.LEADS, 'A2:R');
    let matchRow = null;
    let matchLead = null;
    for (let i = 0; i < rows.length; i++) {
      const lead = rowToLead(rows[i], i + 2);
      if (lead.proposalFolder === folderName) {
        matchRow = i + 2;
        matchLead = lead;
        break;
      }
    }

    if (!matchLead) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: `No lead found with proposalFolder="${folderName}"` }) };
    }

    const updatedRow = [
      matchLead.id,
      matchLead.businessName,
      matchLead.industry,
      matchLead.city,
      matchLead.email,
      matchLead.phone,
      matchLead.website,
      matchLead.priority,
      matchLead.priorityReason,
      matchLead.status,
      matchLead.datePitched,
      matchLead.notes,
      matchLead.subject,
      matchLead.emailBody,
      matchLead.calendlyLinkSent,
      matchLead.isFavourite ? 'TRUE' : 'FALSE',
      siteUrl,
      matchLead.proposalFolder,
    ];
    await updateRow(TABS.LEADS, matchRow, updatedRow);

    await sendProposalLiveEmail(matchLead.businessName, siteUrl, matchLead.id);

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, leadId: matchLead.id }) };
  } catch (err) {
    console.error('proposal-deployed error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};

async function sendProposalLiveEmail(businessName, siteUrl, leadId) {
  const apiKey = process.env.RESEND_API_KEY || 're_BmJGYvCk_NRHFtQr2WAd3ZRfDsUvm1iFi';
  const crmUrl = `https://aventra-crm.netlify.app/#lead=${leadId}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: #16a34a; padding: 24px 32px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Proposal Live</h1>
      </div>
      <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #0F0F0F; margin-top: 0;">
          The proposal for <strong>${businessName}</strong> is now live and ready to share.
        </p>
        <div style="margin: 24px 0; display: flex; gap: 12px;">
          <a href="${siteUrl}" style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; display: inline-block; margin-right: 12px;">
            View Proposal &rarr;
          </a>
          <a href="${crmUrl}" style="background: #2563EB; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; display: inline-block;">
            Open in CRM &rarr;
          </a>
        </div>
        <p style="font-size: 13px; color: #6B7280;">URL: <a href="${siteUrl}" style="color: #2563EB;">${siteUrl}</a></p>
      </div>
      <div style="padding: 16px 32px; font-size: 12px; color: #9CA3AF;">
        Sent by Aventra CRM &middot; Auto-deploy notification
      </div>
    </div>
  `;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Aventra CRM <notifications@aventrasites.online>',
      to: ['joe@aventrasites.online', 'ollie@aventrasites.online'],
      subject: `Proposal live: ${businessName}`,
      html,
    }),
  });
}
