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
  const prompt = `Write a short cold outreach email from Joe at Aventra, a UK web design agency.

Lead details:
- Business: ${lead.businessName}
- Industry: ${lead.industry}
- City: ${lead.city}
- Has website: ${hasWebsite ? `Yes (${lead.website})` : 'No'}${lead.notes ? `\n- Notes: ${lead.notes}` : ''}

Rules:
- Subject line: curiosity-driven, no exclamation marks, not salesy, under 10 words
- Body: 3-4 sentences MAX. Casual, personal, sounds like a real person not a marketer.
- Reference their specific trade and city
- If no website: lead with that pain point (missing enquiries)
- If has website: mention you noticed a couple of ideas to help them get more local work
- End with a tiny low-pressure ask (free mockup, or happy to send ideas)
- Sign off as just "Joe" then "Aventra" on next line
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
