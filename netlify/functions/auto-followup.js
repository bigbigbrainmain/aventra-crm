const { TABS, rowToLead, getRange, appendRow, ensureTab, genId } = require('./_sheets');

const SCHEDULED_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email'];
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit', 'Replied']);
const MAX_FOLLOWUPS = 10;
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
    ? `Write a short follow-up email from Ollie at Aventra, a UK web design agency. This lead OPENED the previous email but hasn't replied — they've shown interest.

Lead details:
${context}

Rules:
- Subject: short, under 8 words, slightly more direct since they opened
- Start with first name (infer from business name or omit) — no "Hi", no "Hey"
- Body: 2-3 sentences MAX. Reference that you know they had a look ("saw you opened my last message"). Be warm and curious, not pushy.
- Reiterate the free mockup offer
- Close with "Best regards," on its own line
- Do NOT add sign-off after "Best regards,"
- NO exclamation marks

Return ONLY valid JSON: {"subject": "...", "body": "..."}`
    : `Write a short cold follow-up email from Ollie at Aventra, a UK web design agency. This lead was contacted before but hasn't opened or replied.

Lead details:
${context}

Rules:
- Subject: short, fresh angle — not "Following up" — under 8 words
- Start with first name (infer from business name or omit) — no "Hi", no "Hey"
- Body: 2-3 sentences MAX. Casual, brief. Slightly different angle from first email.
- Keep the low-pressure ask (free mockup)
- Close with "Best regards," on its own line
- Do NOT add sign-off after "Best regards,"
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

    const rows = await getRange(TABS.LEADS, 'A2:X');
    const leads = rows.map((row, i) => rowToLead(row, i + 2)).filter(l => l.id && l.email);

    const eligible = leads.filter(l =>
      !DEAD_STATUSES.has(l.status) &&
      l.outreachOptedOut !== 'Yes' &&
      l.outreachCount >= 1 &&
      l.outreachCount < MAX_OUTREACH_COUNT &&
      l.industry &&
      l.city
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
