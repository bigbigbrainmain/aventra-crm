const { TABS, rowToLead, rowToScheduled, getRange, appendRow, ensureTab, genId } = require('./_sheets');

const SCHEDULED_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email'];
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit', 'Replied']);
const MAX_FOLLOWUPS = parseInt(process.env.FOLLOWUP_PER_RUN || '5');
const COLD_DELAY_DAYS = 3;   // no open: follow up after 3 days
const WARM_DELAY_DAYS = 3;   // opened no reply: follow up after 3 days
const MAX_OUTREACH_COUNT = 3; // stop after 3 emails total
const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso)) / 86400000);
}

async function generateFollowUp(lead, type) {
  const context = [
    `- Business name: ${lead.businessName}`,
    `- Industry: ${lead.industry}`,
    `- City: ${lead.city}`,
    `- Website: ${lead.website || 'None'}`,
    lead.primaryContact ? `- Primary contact: ${lead.primaryContact}` : null,
    lead.notes ? `- Notes: ${lead.notes}` : null,
  ].filter(Boolean).join('\n');

  const prompt = type === 'warm'
    ? `Write a short follow-up email from Ollie at Aventra, a UK web design agency. This lead was emailed recently and hasn't replied yet.

Lead details:
${context}

Rules:
- Subject: short, under 8 words
- Greeting: "Hi {first name}," using the Primary Contact name if provided, or a first name that is OBVIOUSLY part of the business name (e.g. "Dave's Plumbing" → "Hi Dave,"). Otherwise just "Hi," — NEVER guess a name.
- Body: 2-3 sentences MAX. A casual nudge — "just floating this back to the top of your inbox" or similar. Warm and curious, not pushy.
- NEVER mention email opens, tracking, or that you know whether they read the previous email
- ONLY state facts from the lead details above. NEVER claim anything about their Google rankings, search visibility, SEO, or problems with their website — you have not checked any of those.
- Use UK English spelling throughout
- Do NOT write any call-to-action, offer, booking link, or sign-off. End the body right after your last sentence. The free-homepage offer, a booking link, "Best regards," and the signature are all appended automatically after your text — if you add your own, they will appear twice.
- NEVER use "We specialise in", "We've helped", "our team", "we work with", or any agency pitch language — write as one person reaching out, not a company selling
- NO exclamation marks

Return ONLY valid JSON: {"subject": "...", "body": "..."}`
    : `Write a short cold follow-up email from Ollie at Aventra, a UK web design agency. This lead was contacted before but hasn't replied.

Lead details:
${context}

Rules:
- Subject: short, fresh angle — not "Following up" — under 8 words
- Greeting: "Hi {first name}," using the Primary Contact name if provided, or a first name that is OBVIOUSLY part of the business name (e.g. "Dave's Plumbing" → "Hi Dave,"). Otherwise just "Hi," — NEVER guess a name.
- Body: 2-3 sentences MAX. Casual, brief. Slightly different angle from first email.
- NEVER mention email opens, tracking, or that you know whether they read the previous email
- ONLY state facts from the lead details above. NEVER claim anything about their Google rankings, search visibility, SEO, or problems with their website — you have not checked any of those.
- Use UK English spelling throughout
- Do NOT write any call-to-action, offer, booking link, or sign-off. End the body right after your last sentence. The free-homepage offer, a booking link, "Best regards," and the signature are all appended automatically after your text — if you add your own, they will appear twice.
- NEVER use "We specialise in", "We've helped", "our team", "we work with", or any agency pitch language — write as one person reaching out, not a company selling
- NO exclamation marks

Return ONLY valid JSON: {"subject": "...", "body": "..."}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
  const data = await res.json();
  const text = data.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(text);
}

async function sendSummaryEmail(coldNames, warmNames) {
  const apiKey = process.env.RESEND_API_KEY;
  const total = coldNames.length + warmNames.length;
  if (!apiKey || total === 0) return;

  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px;">
    <div style="background: #d97706; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">${total} follow-up${total !== 1 ? 's' : ''} scheduled to send</h1>
    </div>
    <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
      ${warmNames.length ? `
      <p style="font-size: 14px; font-weight: bold; color: #0F0F0F; margin: 0 0 8px;">Opened but no reply (${warmNames.length})</p>
      <ul style="font-size: 14px; color: #374151; line-height: 2; margin: 0 0 16px;">
        ${warmNames.map(n => `<li>${n}</li>`).join('')}
      </ul>` : ''}
      ${coldNames.length ? `
      <p style="font-size: 14px; font-weight: bold; color: #0F0F0F; margin: 0 0 8px;">No open (${coldNames.length})</p>
      <ul style="font-size: 14px; color: #374151; line-height: 2; margin: 0 0 24px;">
        ${coldNames.map(n => `<li>${n}</li>`).join('')}
      </ul>` : ''}
      <a href="${APP_URL}/prime-leads" style="background: #d97706; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; display: inline-block;">
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
      subject: `${total} follow-up${total !== 1 ? 's' : ''} scheduled`,
      html,
    }),
  });
}

exports.handler = async () => {
  try {
    await ensureTab(TABS.SCHEDULED, SCHEDULED_HEADERS);

    const [leadRows, schedRows] = await Promise.all([
      getRange(TABS.LEADS, 'A2:X'),
      getRange(TABS.SCHEDULED, 'A2:J'),
    ]);

    // IDs of leads that already have a pending scheduled email — skip these
    const alreadyPending = new Set(
      schedRows
        .map(r => rowToScheduled(r, 0))
        .filter(s => s.status === 'pending')
        .map(s => s.leadId)
    );

    const leads = leadRows.map((row, i) => rowToLead(row, i + 2)).filter(l => l.id && l.email);

    const eligible = leads.filter(l =>
      !DEAD_STATUSES.has(l.status) &&
      l.outreachOptedOut !== 'Yes' &&
      l.outreachCount >= 1 &&
      l.outreachCount < MAX_OUTREACH_COUNT &&
      l.industry &&
      l.city &&
      !alreadyPending.has(l.id)
    );

    // Pool A: opened but no reply
    const warmPool = eligible.filter(l =>
      l.emailOpenedAt &&
      l.status !== 'Replied' &&
      daysSince(l.emailOpenedAt) >= WARM_DELAY_DAYS
    );

    // Pool B: never opened
    const coldPool = eligible.filter(l =>
      !l.emailOpenedAt &&
      daysSince(l.lastOutreachAt) >= COLD_DELAY_DAYS
    );

    console.log(`[auto-followup] warm: ${warmPool.length}, cold: ${coldPool.length}`);

    if (warmPool.length === 0 && coldPool.length === 0) {
      console.log('[auto-followup] No follow-up candidates');
      return { statusCode: 200, body: JSON.stringify({ scheduled: 0 }) };
    }

    // Spread sends randomly between 9am–5pm tomorrow
    function randomSendTime() {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9 + Math.floor(Math.random() * 7), Math.floor(Math.random() * 60), 0, 0);
      return d.toISOString();
    }
    const now = new Date().toISOString();

    const warmSucceeded = [];
    const coldSucceeded = [];
    let total = 0;

    // Process warm first (higher value)
    for (const lead of warmPool) {
      if (total >= MAX_FOLLOWUPS) break;
      try {
        const pitch = await generateFollowUp(lead, 'warm');
        const schedId = genId('sched');
        await appendRow(TABS.SCHEDULED, [
          schedId, lead.id, lead.businessName, pitch.subject, pitch.body,
          randomSendTime(), 'pending', now, '', lead.email,
        ]);
        warmSucceeded.push(lead.businessName);
        total++;
        console.log(`[auto-followup] Warm follow-up scheduled: ${lead.businessName}`);
      } catch (err) {
        console.error(`[auto-followup] Failed for ${lead.businessName}:`, err.message);
      }
    }

    // Then cold
    for (const lead of coldPool) {
      if (total >= MAX_FOLLOWUPS) break;
      try {
        const pitch = await generateFollowUp(lead, 'cold');
        const schedId = genId('sched');
        await appendRow(TABS.SCHEDULED, [
          schedId, lead.id, lead.businessName, pitch.subject, pitch.body,
          randomSendTime(), 'pending', now, '', lead.email,
        ]);
        coldSucceeded.push(lead.businessName);
        total++;
        console.log(`[auto-followup] Cold follow-up scheduled: ${lead.businessName}`);
      } catch (err) {
        console.error(`[auto-followup] Failed for ${lead.businessName}:`, err.message);
      }
    }

    if (total > 0) {
      await sendSummaryEmail(coldSucceeded, warmSucceeded).catch(err =>
        console.error('[auto-followup] Summary email failed:', err)
      );
    }

    return { statusCode: 200, body: JSON.stringify({ scheduled: total, warm: warmSucceeded.length, cold: coldSucceeded.length }) };
  } catch (err) {
    console.error('[auto-followup] Fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
