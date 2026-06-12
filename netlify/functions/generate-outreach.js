const { TABS, rowToLead, getRange, updateRange } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function findLead(leadId) {
  const rows = await getRange(TABS.LEADS, 'A2:X');
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
    lead.reviewCount > 0 ? `- Google Reviews: ${lead.reviewCount} reviews, ${lead.avgRating}★ average` : null,
    `- Priority: ${lead.priority || 'not set'}`,
    `- Status: ${lead.status || 'New'}`,
    `- Date pitched: ${lead.datePitched || 'not yet'}`,
    `- Calendly link sent: ${lead.calendlyLinkSent || 'No'}`,
    lead.primaryContact ? `- Primary contact: ${lead.primaryContact}` : null,
    lead.notes ? `- Notes: ${lead.notes}` : null,
    lead.priorityReason ? `- Priority reason: ${lead.priorityReason}` : null,
  ].filter(Boolean).join('\n');

  const prompt = isFollowUp
    ? `Write a short follow-up email from Ollie at Aventra, a UK web design agency. This lead was contacted before but hasn't replied.

Lead details:
${context}

Rules:
- Subject line: short, references the previous email or just checking in — under 8 words, no exclamation marks
- Greeting: "Hi {first name}," using the Primary Contact name if provided, or a first name that is OBVIOUSLY part of the business name (e.g. "Dave's Plumbing" → "Hi Dave,"). Otherwise just "Hi," — NEVER guess a name and NEVER use the business name as a person's name.
- Body: 2-3 sentences MAX. Casual, brief, not pushy. Open with something like "just following up on my last email" or "wanted to check if my last message landed". Reference their business/trade specifically.
- ONLY state facts that appear in the lead details above. NEVER claim anything about their Google rankings, search visibility, SEO, or the quality of their website — you have not checked any of those.
- Use UK English spelling throughout (e.g. "specialise", "optimise", "colour")
- End with the same low-pressure ask as before (the free example homepage)
- Close with "Best regards," on its own line before the sign-off
- Do NOT include any sign-off or signature after "Best regards," — that is added separately
- NO marketing speak, NO exclamation marks, NO templates

Return ONLY valid JSON in this exact format, nothing else:
{"subject": "...", "body": "..."}`
    : `Write a short cold outreach email from Ollie at Aventra, a UK web design agency.

Lead details:
${context}

Rules:
- Subject line: plain and specific, under 8 words — e.g. "website for ${lead.businessName}" or "your ${lead.industry || 'business'} reviews". Not salesy, no clickbait, no exclamation marks.
- Greeting: "Hi {first name}," using the Primary Contact name if provided, or a first name that is OBVIOUSLY part of the business name (e.g. "Dave's Plumbing" → "Hi Dave,"). Otherwise just "Hi," — NEVER guess a name and NEVER use the business name as a person's name.
- Body: 3-4 sentences MAX. Casual, personal, sounds like a real person not a marketer.
- Reference their specific trade and city
- ONLY state facts that appear in the lead details above. NEVER claim anything about their Google rankings, search visibility, SEO, or problems with their website — you have not checked any of those and a false claim destroys trust instantly.
- If they have no website: that IS the angle — people find them on Google but there's no site to look at, so enquiries drift to whoever has one. If they have 10+ reviews, acknowledge that strong reputation first.
- If they have a website: say you came across the business while looking at ${lead.industry || 'trades'} in their area and offer to send over a couple of ideas — do NOT pretend you reviewed their site or spotted problems with it.
- If notes mention something specific AND verified (e.g. SSL issue, spoke to them before), you may use that as the angle
- Vary the opening between emails — do NOT start with "I noticed"
- Use UK English spelling throughout (e.g. "specialise", "optimise", "colour")
- End with ONE of these CTAs — vary them, never use the same one twice in a row:
  • "Happy to put together a free example homepage for your business, so you can see exactly how it could look before spending a penny — want me to?"
  • "Would it be worth me building you a free example homepage, so you can see it before deciding anything?"
  • "I could mock up a free example homepage for you — if you like it we can talk, and if not, no harm done."
- After the CTA, add this exact final sentence: "And if you'd rather I didn't email again, just reply 'no thanks' — no hard feelings."
- NEVER say "for your practice" — use their actual trade (e.g. "for your grooming business", "for your driving school", "for your plumbing business")
- Close with "Best regards," on its own line before the sign-off
- Do NOT include any sign-off or signature after "Best regards," — that is added separately
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
