const { TABS, rowToLead, getRange, updateRange } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:W');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === leadId) {
      return { lead: rowToLead(rows[i], i + 2), rowNum: i + 2 };
    }
  }
  return null;
}

async function generatePitch(lead) {
  const hasWebsite = lead.website && lead.website.trim() !== '';
  const isFollowUp = lead.outreachCount > 0;

  const context = [
    `- Business name: ${lead.businessName}`,
    `- Industry: ${lead.industry || 'unknown'}`,
    `- City: ${lead.city || 'unknown'}`,
    `- Email: ${lead.email || 'unknown'}`,
    `- Phone: ${lead.phone || 'none on file'}`,
    `- Website: ${hasWebsite ? lead.website : 'None — they have no website'}`,
    `- Priority: ${lead.priority || 'not set'}`,
    `- Status: ${lead.status || 'New'}`,
    `- Date pitched: ${lead.datePitched || 'not yet'}`,
    `- Calendly link sent: ${lead.calendlyLinkSent || 'No'}`,
    lead.notes ? `- Notes: ${lead.notes}` : null,
    lead.priorityReason ? `- Priority reason: ${lead.priorityReason}` : null,
  ].filter(Boolean).join('\n');

  const prompt = isFollowUp
    ? `Write a short follow-up email from Ollie at Aventra, a UK web design agency. This lead was contacted before but hasn't replied.

Lead details:
${context}

Rules:
- Subject line: short, references the previous email or just checking in — under 8 words, no exclamation marks
- Body: 2-3 sentences MAX. Casual, brief, not pushy. Open with something like "just following up on my last email" or "wanted to check if my last message landed". Reference their business/trade specifically.
- End with the same low-pressure ask as before (free mockup, or happy to send ideas)
- Do NOT include any sign-off or signature — that is added separately
- NO marketing speak, NO exclamation marks, NO templates

Return ONLY valid JSON in this exact format, nothing else:
{"subject": "...", "body": "..."}`
    : `Write a short cold outreach email from Ollie at Aventra, a UK web design agency.

Lead details:
${context}

Rules:
- Subject line: curiosity-driven, no exclamation marks, not salesy, under 10 words
- Body: 3-4 sentences MAX. Casual, personal, sounds like a real person not a marketer.
- Reference their specific trade and city
- If they have no website: lead with that pain point (they're missing enquiries from people searching online)
- If they have a website: mention you spotted a couple of ideas to help them get more local work
- If notes mention anything specific (e.g. SSL issue, bad site, spoke to them before), use that as the angle
- End with a tiny low-pressure ask (free mockup, or happy to send ideas)
- Do NOT include any sign-off or signature — that is added separately
- NO unsubscribe links, NO marketing speak, NO exclamation marks

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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(text);
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
    if (!lead.industry || !lead.city) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Lead needs industry and city to generate a pitch' }) };
    }

    const pitch = await generatePitch(lead);

    // Save subject (col M=13) and body (col N=14) to sheet
    await updateRange(TABS.LEADS, `M${rowNum}`, [pitch.subject, pitch.body]);

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(pitch) };
  } catch (err) {
    console.error('generate-outreach error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
