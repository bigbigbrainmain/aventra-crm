const { TABS, getRange, appendRow, genId, ensureTab } = require('./_sheets');

const SCHEDULED_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email'];

const INDUSTRIES = [
  'plumber', 'electrician', 'builder', 'roofer', 'painter decorator',
  'flooring installer', 'kitchen fitter', 'bathroom fitter', 'plasterer',
  'landscaper', 'carpenter', 'glazier', 'locksmith', 'window cleaner',
  'carpet cleaner', 'pest control', 'dog groomer', 'personal trainer',
  'chiropractor', 'solicitor', 'accountant', 'mortgage broker',
  'estate agent', 'restaurant', 'cafe', 'bakery', 'hair salon',
  'barber', 'nail salon', 'beauty salon', 'gym', 'driving instructor',
  'photographer', 'event planner', 'catering', 'cleaning company',
  'removal company', 'skip hire',
];

const CITIES = [
  'Leeds', 'Sheffield', 'Manchester', 'Birmingham', 'Bristol',
  'Nottingham', 'Leicester', 'Liverpool', 'Newcastle', 'Hull',
  'Bradford', 'Coventry', 'Southampton', 'Brighton', 'Plymouth',
  'Derby', 'Wolverhampton', 'Exeter', 'Chester', 'Preston',
  'Bolton', 'Warrington', 'Middlesbrough', 'York', 'Harrogate',
  'Halifax', 'Huddersfield', 'Wakefield', 'Doncaster', 'Lincoln',
  'Peterborough', 'Luton', 'Reading', 'Swindon', 'Bath',
  'Cheltenham', 'Northampton', 'Ipswich', 'Norwich', 'Cambridge',
];

const MAX_LEADS = 8;
const COMBOS_PER_RUN = 3;
const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EMAIL_NOISE = ['noreply', 'no-reply', '@example', '.png', '.jpg', '.svg', '@sentry', '@w3', 'schema.org'];

function extractEmail(html) {
  const matches = html.match(EMAIL_RE) || [];
  return matches.find(e => !EMAIL_NOISE.some(n => e.includes(n))) || null;
}

async function scrapeEmail(website) {
  const base = website.startsWith('http') ? website.replace(/\/$/, '') : `https://${website.replace(/\/$/, '')}`;
  for (const path of ['', '/contact', '/contact-us', '/about']) {
    try {
      const res = await fetch(base + path, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AventraCRM/1.0)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const email = extractEmail(await res.text());
      if (email) return email;
    } catch { /* continue */ }
  }
  return null;
}

async function generatePitch(lead) {
  const hasWebsite = !!lead.website;
  const prompt = `Write a short cold outreach email from Ollie at Aventra, a UK web design agency.

Lead details:
- Business name: ${lead.businessName}
- Industry: ${lead.industry}
- City: ${lead.city}
- Website: ${hasWebsite ? lead.website : 'None — they have no website'}

Rules:
- Subject: curiosity-driven, under 10 words, no exclamation marks
- Start with first name (infer from business name or omit) — no "Hi", no "Hey"
- Body: 3-4 sentences MAX. Casual, personal.
- ${hasWebsite ? 'Mention you spotted ideas to help them get more local work' : 'Lead with missing enquiries from people searching online'}
- End with a low-pressure ask (free mockup)
- Close with "Best regards," on its own line
- Do NOT add sign-off after "Best regards,"
- NO exclamation marks, NO marketing speak

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
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  const text = data.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(text);
}

async function sendSummaryEmail(added, scheduled) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !added.length) return;
  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px;">
    <div style="background: #2563eb; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">Auto lead gen: ${added.length} new leads added</h1>
    </div>
    <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
      <p style="font-size: 15px; color: #0F0F0F; margin-top: 0;">
        <strong>${added.length}</strong> leads added · <strong>${scheduled}</strong> emails scheduled
      </p>
      <ul style="font-size: 14px; color: #374151; line-height: 2; margin: 0 0 24px;">
        ${added.map(l => `<li>${l.businessName} — ${l.industry}, ${l.city}${l.email ? ' ✓ email' : ''}</li>`).join('')}
      </ul>
      <a href="${APP_URL}/leads" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; display: inline-block;">View Leads →</a>
    </div>
  </div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Aventra CRM <notifications@aventrasites.online>',
      to: ['joe@aventrasites.online', 'ollie@aventrasites.online'],
      subject: `Auto lead gen: ${added.length} new leads, ${scheduled} emails scheduled`,
      html,
    }),
  });
}

exports.handler = async () => {
  try {
    const googleKey = process.env.GOOGLE_API_KEY;
    if (!googleKey) { console.log('[auto-lead-gen] No GOOGLE_API_KEY'); return { statusCode: 200, body: 'skipped' }; }

    await ensureTab(TABS.SCHEDULED, SCHEDULED_HEADERS);

    const existingRows = await getRange(TABS.LEADS, 'A2:B');
    const existingNames = new Set(existingRows.map(r => String(r[1] || '').toLowerCase().trim()));

    // Pick unique combos
    const used = new Set();
    const combos = [];
    while (combos.length < COMBOS_PER_RUN) {
      const industry = pick(INDUSTRIES);
      const city = pick(CITIES);
      const key = `${industry}|${city}`;
      if (!used.has(key)) { used.add(key); combos.push({ industry, city }); }
    }

    const newLeads = [];

    for (const { industry, city } of combos) {
      if (newLeads.length >= MAX_LEADS) break;
      console.log(`[auto-lead-gen] Searching: ${industry} in ${city}`);
      try {
        const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleKey,
            'X-Goog-FieldMask': 'places.displayName,places.nationalPhoneNumber,places.websiteUri',
          },
          body: JSON.stringify({ textQuery: `${industry} in ${city}`, maxResultCount: 20 }),
        });
        if (!placesRes.ok) continue;
        const placesData = await placesRes.json();
        for (const place of (placesData.places || [])) {
          if (newLeads.length >= MAX_LEADS) break;
          const name = place.displayName?.text || '';
          if (!name || existingNames.has(name.toLowerCase().trim())) continue;
          newLeads.push({
            id: genId('L'),
            businessName: name,
            industry,
            city,
            phone: place.nationalPhoneNumber || '',
            website: place.websiteUri || '',
            email: '',
          });
          existingNames.add(name.toLowerCase().trim());
        }
      } catch (err) {
        console.error(`[auto-lead-gen] Places error for ${industry}/${city}:`, err.message);
      }
    }

    if (!newLeads.length) {
      console.log('[auto-lead-gen] No new leads found');
      return { statusCode: 200, body: JSON.stringify({ added: 0 }) };
    }

    // Add leads to sheet + find emails + schedule
    const sendAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    let scheduledCount = 0;

    for (const lead of newLeads) {
      try {
        // Scrape email if website exists
        if (lead.website) {
          lead.email = (await scrapeEmail(lead.website)) || '';
        }

        await appendRow(TABS.LEADS, [
          lead.id, lead.businessName, lead.industry, lead.city,
          lead.email, lead.phone, lead.website,
          '', '', 'New', '', '', '', '', 'No', 'FALSE',
          '', '', '', '', '', 0, '', '', '',
        ]);

        if (lead.email) {
          const pitch = await generatePitch(lead);
          const schedId = genId('sched');
          await appendRow(TABS.SCHEDULED, [
            schedId, lead.id, lead.businessName, pitch.subject, pitch.body,
            sendAt, 'pending', now, '', lead.email,
          ]);
          scheduledCount++;
          console.log(`[auto-lead-gen] Scheduled email for ${lead.businessName} (${lead.email})`);
        } else {
          console.log(`[auto-lead-gen] Added ${lead.businessName} (no email found)`);
        }
      } catch (err) {
        console.error(`[auto-lead-gen] Failed for ${lead.businessName}:`, err.message);
      }
    }

    await sendSummaryEmail(newLeads, scheduledCount).catch(err =>
      console.error('[auto-lead-gen] Summary email failed:', err)
    );

    return { statusCode: 200, body: JSON.stringify({ added: newLeads.length, scheduled: scheduledCount }) };
  } catch (err) {
    console.error('[auto-lead-gen] Fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
