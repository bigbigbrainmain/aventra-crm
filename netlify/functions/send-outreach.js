const { TABS, rowToLead, getRange, updateRange } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FROM = process.env.OUTREACH_FROM || 'ollie@aventrasites.online';
const FROM_NAME = process.env.OUTREACH_FROM_NAME || 'Ollie';
const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

// Plus-addressed reply-to (e.g. ollie+lead_x1@domain) delivers to the FROM
// mailbox while carrying the lead ID, so reply-webhook can match the lead.
function replyToFor(leadId) {
  const [local, domain] = FROM.split('@');
  return `${local}+${leadId}@${domain}`;
}

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:W');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === leadId) {
      return { lead: rowToLead(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { leadId } = JSON.parse(event.body || '{}');
    if (!leadId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing leadId' }) };

    const result = await findLead(leadId);
    if (!result) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Lead not found' }) };

    const { lead, rowNum } = result;

    if (!lead.email) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Lead has no email address' }) };
    if (lead.outreachOptedOut === 'Yes') return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Lead has opted out' }) };
    if (!lead.subject || !lead.emailBody) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Generate an AI pitch first' }) };

    const unsubUrl = `${APP_URL}/.netlify/functions/outreach-unsubscribe?id=${leadId}`;
    const bodyHtml = lead.emailBody.replace(/\n/g, '<br>');
    const html = `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.7; max-width: 600px;">
<p style="margin: 0 0 24px 0;">${bodyHtml}</p>
<p style="color: #555; font-size: 13px; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 16px; margin: 0 0 32px 0;">
  --<br>
  Ollie Eastham<br>
  Aventra<br>
  +44 7787 447731<br>
  <a href="https://aventrasites.online" style="color: #555; text-decoration: none;">aventrasites.online</a>
</p>
<p style="font-size: 11px; color: #999; margin: 0;">
  <a href="${unsubUrl}" style="color: #999;">Unsubscribe</a>
</p>
</div>`;

    const apiKey = process.env.RESEND_API_KEY;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM}>`,
        to: [lead.email],
        reply_to: [replyToFor(leadId), 'joe@aventrasites.online'],
        subject: lead.subject,
        html,
        tags: [{ name: 'leadId', value: leadId }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend error: ${err}`);
    }

    const now = new Date().toISOString();
    const isFirst = !lead.outreachSentAt;
    const newCount = (lead.outreachCount || 0) + 1;

    // Update cols S (outreachSentAt), T (outreachCount), U (lastOutreachAt)
    await updateRange(TABS.LEADS, `S${rowNum}`, [
      isFirst ? now : lead.outreachSentAt,
      newCount,
      now,
    ]);

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, outreachCount: newCount }) };
  } catch (err) {
    console.error('send-outreach error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
