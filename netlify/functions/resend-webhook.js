const { TABS, rowToLead, getRange, updateRange, updateCell, leadIdTag } = require('./_sheets');

// Resend webhook tags carry the sanitised leadId (see leadIdTag), so match by
// comparing the sanitised column-A ID — otherwise legacy IDs with stripped
// characters never match and their bounces/opt-outs are silently dropped.
async function findLead(leadId) {
  if (!leadId) return null;
  const target = leadIdTag(leadId);
  const rows = await getRange(TABS.LEADS, 'A2:W');
  for (let i = 0; i < rows.length; i++) {
    if (leadIdTag(rows[i][0]) === target) {
      return { lead: rowToLead(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

async function handleOpened(data) {
  const leadId = data.tags?.leadId;
  if (!leadId) return;

  const result = await findLead(leadId);
  if (!result) return;

  const { lead, rowNum } = result;
  if (lead.emailOpenedAt) return; // only record the first open

  const now = new Date().toISOString();

  // Record the open (the follow-up logic uses opened-vs-not to time warm
  // follow-ups) but don't email a notification — opens are surfaced in the
  // daily summary instead.
  await updateRange(TABS.LEADS, `V${rowNum}`, [now]);

  console.log(`[resend-webhook] Lead ${leadId} opened email`);
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
