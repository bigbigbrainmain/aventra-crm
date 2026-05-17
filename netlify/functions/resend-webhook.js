const { TABS, rowToLead, getRange, updateRange } = require('./_sheets');

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:W');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === leadId) {
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
  if (lead.emailOpenedAt) return; // already recorded first open

  const now = new Date().toISOString();

  // Bump to Priority 1 if currently lower priority
  const lowerPriorities = ['🟠 Priority 2', '🟡 Priority 3', '🟢 Skip', ''];
  const newPriority = lowerPriorities.includes(lead.priority) ? '🔴 Priority 1' : lead.priority;

  // Update col V (emailOpenedAt) and col H (priority) — these aren't adjacent so do separately
  await updateRange(TABS.LEADS, `V${rowNum}`, [now]);
  await updateRange(TABS.LEADS, `H${rowNum}`, [newPriority]);

  console.log(`[resend-webhook] Lead ${leadId} opened email — priority set to ${newPriority}`);
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
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[resend-webhook] error:', err);
    return { statusCode: 400, body: 'Bad Request' };
  }
};
