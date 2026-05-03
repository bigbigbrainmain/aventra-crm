const { TABS, rowToLead, getRange, updateRow, deleteRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
};

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:R');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === leadId) {
      return { lead: rowToLead(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

async function sendProposalRequestedEmail(lead) {
  const apiKey = process.env.RESEND_API_KEY || 're_BmJGYvCk_NRHFtQr2WAd3ZRfDsUvm1iFi';
  const crmUrl = `https://aventra-crm.netlify.app/#lead=${lead.id}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: #7c3aed; padding: 24px 32px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Proposal Requested</h1>
      </div>
      <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #0F0F0F; margin-top: 0;">
          A proposal has been requested for <strong>${lead.businessName}</strong>.
        </p>
        <table style="font-size: 13px; color: #374151; border-collapse: collapse; width: 100%;">
          ${lead.email ? `<tr><td style="padding: 4px 0; color: #6B7280; width: 100px;">Email</td><td><a href="mailto:${lead.email}" style="color: #2563EB;">${lead.email}</a></td></tr>` : ''}
          ${lead.phone ? `<tr><td style="padding: 4px 0; color: #6B7280;">Phone</td><td>${lead.phone}</td></tr>` : ''}
          ${lead.city ? `<tr><td style="padding: 4px 0; color: #6B7280;">Location</td><td>${lead.city}</td></tr>` : ''}
          ${lead.industry ? `<tr><td style="padding: 4px 0; color: #6B7280;">Industry</td><td>${lead.industry}</td></tr>` : ''}
        </table>
        <div style="margin-top: 24px;">
          <a href="${crmUrl}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; display: inline-block;">
            Open Lead in CRM &rarr;
          </a>
        </div>
      </div>
      <div style="padding: 16px 32px; font-size: 12px; color: #9CA3AF;">
        Sent by Aventra CRM &middot; Status change notification
      </div>
    </div>
  `;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Aventra CRM <notifications@aventrasites.online>',
      to: ['joe@aventrasites.online', 'ollie@aventrasites.online'],
      subject: `Proposal requested: ${lead.businessName}`,
      html,
    }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const leadId = (event.queryStringParameters || {}).id;
  if (!leadId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };

  try {
    if (event.httpMethod === 'GET') {
      const result = await findLead(leadId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(result.lead) };
    }

    if (event.httpMethod === 'PATCH') {
      const result = await findLead(leadId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };

      const updates = JSON.parse(event.body || '{}');
      const updated = { ...result.lead, ...updates };
      const row = [
        updated.id,
        updated.businessName,
        updated.industry,
        updated.city,
        updated.email,
        updated.phone,
        updated.website,
        updated.priority,
        updated.priorityReason,
        updated.status,
        updated.datePitched,
        updated.notes,
        updated.subject,
        updated.emailBody,
        updated.calendlyLinkSent,
        updated.isFavourite ? 'TRUE' : 'FALSE',
        updated.proposalUrl || '',
        updated.proposalFolder || '',
      ];
      await updateRow(TABS.LEADS, result.rowNum, row);

      if (updates.status === 'Proposal Requested' && result.lead.status !== 'Proposal Requested') {
        sendProposalRequestedEmail(updated).catch(console.error);
      }

      const { _row, ...clean } = updated;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify(clean) };
    }

    if (event.httpMethod === 'DELETE') {
      const result = await findLead(leadId);
      if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) };
      await deleteRow(TABS.LEADS, result.rowNum);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('lead error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
