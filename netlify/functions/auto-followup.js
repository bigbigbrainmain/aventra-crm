const { TABS, rowToLead, getRange, updateRange } = require('./_sheets');

const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit']);
const FOLLOWUP_DAYS = 5;
const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso)) / 86400000);
}

async function generateFollowUpPitch(lead) {
  const hasWebsite = lead.website && lead.website.trim() !== '';
  const context = [
    `- Business name: ${lead.businessName}`,
    `- Industry: ${lead.industry}`,
    `- City: ${lead.city}`,
    `- Website: ${hasWebsite ? lead.website : 'None — they have no website'}`,
    lead.notes ? `- Notes: ${lead.notes}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `Write a short follow-up email from Ollie at Aventra, a UK web design agency. This lead was contacted before but hasn't replied.

Lead details:
${context}

Rules:
- Subject line: short, references the previous email or just checking in — under 8 words, no exclamation marks
- Body: 2-3 sentences MAX. Casual, brief, not pushy. Open with something like "just following up on my last email" or "wanted to check if my last message landed". Reference their business/trade specifically.
- End with the same low-pressure ask as before (free mockup, or happy to send ideas)
- Sign off as just "Ollie" then "Aventra" on next line
- NO marketing speak, NO exclamation marks, NO templates

Return ONLY valid JSON in this exact format, nothing else:
{"subject": "...", "body": "..."}`;

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

async function sendSummaryEmail(names) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const count = names.length;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: #d97706; padding: 24px 32px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Follow-up drafts ready</h1>
      </div>
      <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; color: #0F0F0F; margin-top: 0;">
          <strong>${count} follow-up draft${count === 1 ? '' : 's'}</strong> ${count === 1 ? 'has' : 'have'} been generated and ${count === 1 ? 'is' : 'are'} ready to review in Outreach:
        </p>
        <ul style="font-size: 14px; color: #374151; line-height: 2; margin: 0 0 24px;">
          ${names.map(n => `<li>${n}</li>`).join('')}
        </ul>
        <a href="${APP_URL}/outreach" style="background: #d97706; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px;">
          Review in Outreach &rarr;
        </a>
      </div>
      <div style="padding: 16px 32px; font-size: 12px; color: #9CA3AF;">
        Sent by Aventra CRM &middot; Daily follow-up automation
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
      subject: `${count} follow-up draft${count === 1 ? '' : 's'} ready to send`,
      html,
    }),
  });
}

exports.handler = async () => {
  try {
    const rows = await getRange(TABS.LEADS, 'A2:W');
    const allLeads = rows.map((row, i) => rowToLead(row, i + 2));

    const candidates = allLeads.filter(lead =>
      lead.outreachCount === 1 &&
      !lead.emailOpenedAt &&
      lead.outreachOptedOut !== 'Yes' &&
      !DEAD_STATUSES.has(lead.status) &&
      lead.industry &&
      lead.city &&
      daysSince(lead.lastOutreachAt) >= FOLLOWUP_DAYS
    );

    if (candidates.length === 0) {
      console.log('[auto-followup] No follow-up candidates today');
      return { statusCode: 200, body: JSON.stringify({ generated: 0 }) };
    }

    console.log(`[auto-followup] Generating pitches for ${candidates.length} leads`);

    const results = await Promise.allSettled(
      candidates.map(async (lead) => {
        const pitch = await generateFollowUpPitch(lead);
        await updateRange(TABS.LEADS, `M${lead._row}`, [pitch.subject, pitch.body]);
        console.log(`[auto-followup] Generated follow-up for ${lead.businessName}`);
        return lead.businessName;
      })
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected');

    if (failed.length > 0) {
      console.error(`[auto-followup] ${failed.length} failed:`, failed.map(r => r.reason?.message));
    }

    if (succeeded.length > 0) {
      await sendSummaryEmail(succeeded).catch(err =>
        console.error('[auto-followup] Summary email failed:', err)
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ generated: succeeded.length, failed: failed.length }),
    };
  } catch (err) {
    console.error('[auto-followup] Fatal error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
