const { TABS, rowToLead, rowToScheduled, getRange, appendRow, genId, ensureTab } = require('./_sheets');

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

const MAX_LEADS = parseInt(process.env.OUTREACH_PER_RUN || '5');
const COMBOS_PER_RUN = 4;
const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit', 'Replied']);

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
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
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
  const reviewLine = lead.reviewCount > 0
    ? `- Google Reviews: ${lead.reviewCount} reviews, ${lead.avgRating}★ average`
    : null;

  const prompt = `Write a short cold outreach email from Ollie at Aventra, a UK web design agency.

Lead details:
- Business name: ${lead.businessName}
- Industry: ${lead.industry}
- City: ${lead.city}
- Website: ${hasWebsite ? lead.website : 'None — they have no website'}
${reviewLine || ''}

Rules:
- Subject: plain and specific, under 8 words — e.g. "website for ${lead.businessName}" or "your ${lead.industry} reviews". No clickbait, no exclamation marks.
- Greeting: "Hi {first name}," ONLY if a first name is obviously part of the business name (e.g. "Dave's Plumbing" → "Hi Dave,"). Otherwise just "Hi," — NEVER guess a name and NEVER use the business name as a person's name.
- Body: 3 sentences MAX. Casual, personal.
- ONLY state facts from the lead details above. NEVER claim anything about their Google rankings, search visibility, SEO, or problems with their website — you have not checked any of those and a false claim destroys trust instantly.
- ${hasWebsite ? 'Angle: you came across the business while looking at local trades and would happily send over a couple of ideas — do NOT pretend you reviewed their site or spotted problems with it' : 'Angle: people find them on Google but there is no website to look at, so enquiries drift to whoever has one'}
${lead.reviewCount > 10 ? `- They have ${lead.reviewCount} Google reviews (${lead.avgRating}★) — acknowledge that strong local reputation first, then connect to why a website would help even more people find them` : ''}
- Vary the opening — do NOT start with "I noticed"
- Use UK English spelling throughout (e.g. "specialise", "optimise", "colour")
- Do NOT write any call-to-action, offer, booking link, or sign-off. End the body right after your last sentence of context. The offer of a free example homepage, a booking link, "Best regards," and the signature are all appended automatically after your text — if you add your own, they will appear twice.
- NEVER say "for your practice" — use their actual trade (e.g. "for your grooming business", "for your driving school")
- NEVER use "We specialise in", "We've helped", "our team", "we work with", or any agency pitch language — write as one person reaching out, not a company selling
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

async function sendSummaryEmail(backlogLeads, newLeads, scheduledCount) {
  const apiKey = process.env.RESEND_API_KEY;
  const total = backlogLeads.length + newLeads.length;
  if (!apiKey || total === 0) return;

  const backlogSection = backlogLeads.length ? `
    <p style="font-size: 14px; font-weight: bold; color: #0F0F0F; margin: 0 0 8px;">From backlog (${backlogLeads.length})</p>
    <ul style="font-size: 14px; color: #374151; line-height: 2; margin: 0 0 16px;">
      ${backlogLeads.map(l => `<li>${l.businessName} — ${l.industry}, ${l.city} ✓ email</li>`).join('')}
    </ul>` : '';

  const newSection = newLeads.length ? `
    <p style="font-size: 14px; font-weight: bold; color: #0F0F0F; margin: 0 0 8px;">New leads found (${newLeads.length})</p>
    <ul style="font-size: 14px; color: #374151; line-height: 2; margin: 0 0 24px;">
      ${newLeads.map(l => `<li>${l.businessName} — ${l.industry}, ${l.city}${l.email ? ' ✓ email' : ''}</li>`).join('')}
    </ul>` : '';

  const html = `<div style="font-family: Arial, sans-serif; max-width: 560px;">
    <div style="background: #2563eb; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">Auto lead gen: ${scheduledCount} emails scheduled</h1>
    </div>
    <div style="background: #f9f9f9; padding: 32px; border: 1px solid #e5e7eb;">
      <p style="font-size: 15px; color: #0F0F0F; margin-top: 0;">
        <strong>${backlogLeads.length}</strong> from backlog · <strong>${newLeads.length}</strong> new leads · <strong>${scheduledCount}</strong> emails scheduled
      </p>
      ${backlogSection}
      ${newSection}
      <a href="${APP_URL}/leads" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; display: inline-block;">View Leads →</a>
    </div>
  </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Aventra CRM <notifications@aventrasites.online>',
      to: ['joe@aventrasites.online', 'ollie@aventrasites.online'],
      subject: `Auto lead gen: ${scheduledCount} emails scheduled (${backlogLeads.length} backlog, ${newLeads.length} new)`,
      html,
    }),
  });
}

exports.handler = async () => {
  try {
    const googleKey = process.env.GOOGLE_API_KEY;
    if (!googleKey) { console.log('[auto-lead-gen] No GOOGLE_API_KEY'); return { statusCode: 200, body: 'skipped' }; }

    await ensureTab(TABS.SCHEDULED, SCHEDULED_HEADERS);

    // Read lead data and scheduled queue together
    const [existingRows, schedRows] = await Promise.all([
      getRange(TABS.LEADS, 'A2:Z'),
      getRange(TABS.SCHEDULED, 'A2:J'),
    ]);
    const existingNames = new Set(existingRows.map(r => String(r[1] || '').toLowerCase().trim()));

    // Skip leads that already have a pending email queued
    const alreadyPending = new Set(
      schedRows
        .map(r => rowToScheduled(r, 0))
        .filter(s => s.status === 'pending')
        .map(s => s.leadId)
    );

    // Backlog: leads with email found, never contacted, not dead/opted-out, not already queued
    const backlog = existingRows
      .map((row, i) => rowToLead(row, i + 2))
      .filter(l =>
        l.id &&
        l.email &&
        l.outreachCount === 0 &&
        !DEAD_STATUSES.has(l.status) &&
        l.outreachOptedOut !== 'Yes' &&
        !l.priorityReason.includes('email:not-found') &&
        !alreadyPending.has(l.id)
      );

    console.log(`[auto-lead-gen] Backlog: ${backlog.length} uncontacted leads with emails`);

    function randomSendTime() {
      const d = new Date();
      if (d.getHours() >= 16) d.setDate(d.getDate() + 1);
      d.setHours(9 + Math.floor(Math.random() * 7), Math.floor(Math.random() * 60), 0, 0);
      return d.toISOString();
    }
    const now = new Date().toISOString();
    let scheduledCount = 0;
    const backlogScheduled = [];

    // Process backlog first, up to MAX_LEADS
    for (const lead of backlog) {
      if (scheduledCount >= MAX_LEADS) break;
      try {
        const pitch = await generatePitch(lead);
        const schedId = genId('sched');
        await appendRow(TABS.SCHEDULED, [
          schedId, lead.id, lead.businessName, pitch.subject, pitch.body,
          randomSendTime(), 'pending', now, '', lead.email,
        ]);
        backlogScheduled.push(lead);
        scheduledCount++;
        console.log(`[auto-lead-gen] Backlog scheduled: ${lead.businessName} (${lead.email})`);
      } catch (err) {
        console.error(`[auto-lead-gen] Backlog failed for ${lead.businessName}:`, err.message);
      }
    }

    // Fill remaining slots with new leads from Google Places
    const remainingSlots = MAX_LEADS - scheduledCount;
    const newLeads = [];

    if (remainingSlots > 0) {
      const used = new Set();
      const combos = [];
      while (combos.length < COMBOS_PER_RUN) {
        const industry = pick(INDUSTRIES);
        const city = pick(CITIES);
        const key = `${industry}|${city}`;
        if (!used.has(key)) { used.add(key); combos.push({ industry, city }); }
      }

      for (const { industry, city } of combos) {
        if (newLeads.length >= remainingSlots) break;
        console.log(`[auto-lead-gen] Searching: ${industry} in ${city}`);
        try {
          const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleKey,
              'X-Goog-FieldMask': 'places.displayName,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount',
            },
            body: JSON.stringify({ textQuery: `${industry} in ${city}`, maxResultCount: 20 }),
          });
          if (!placesRes.ok) continue;
          const placesData = await placesRes.json();
          for (const place of (placesData.places || [])) {
            if (newLeads.length >= remainingSlots) break;
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
              reviewCount: place.userRatingCount || 0,
              avgRating: place.rating || 0,
            });
            existingNames.add(name.toLowerCase().trim());
          }
        } catch (err) {
          console.error(`[auto-lead-gen] Places error for ${industry}/${city}:`, err.message);
        }
      }

      for (const lead of newLeads) {
        try {
          if (lead.website) {
            lead.email = (await scrapeEmail(lead.website)) || '';
          }

          await appendRow(TABS.LEADS, [
            lead.id, lead.businessName, lead.industry, lead.city,
            lead.email, lead.phone, lead.website,
            '', lead.email ? '' : 'email:not-found', 'New', '', '', '', '', 'No', 'FALSE',
            '', '', '', '', '', '', '', '',
            lead.reviewCount || 0, lead.avgRating || 0, 'auto',
          ]);

          if (lead.email) {
            const pitch = await generatePitch(lead);
            const schedId = genId('sched');
            await appendRow(TABS.SCHEDULED, [
              schedId, lead.id, lead.businessName, pitch.subject, pitch.body,
              randomSendTime(), 'pending', now, '', lead.email,
            ]);
            scheduledCount++;
            console.log(`[auto-lead-gen] New lead scheduled: ${lead.businessName} (${lead.email})`);
          } else {
            console.log(`[auto-lead-gen] New lead added (no email): ${lead.businessName}`);
          }
        } catch (err) {
          console.error(`[auto-lead-gen] Failed for ${lead.businessName}:`, err.message);
        }
      }
    } else {
      console.log(`[auto-lead-gen] Backlog filled all ${MAX_LEADS} slots — skipping new lead search`);
    }

    await sendSummaryEmail(backlogScheduled, newLeads, scheduledCount).catch(err =>
      console.error('[auto-lead-gen] Summary email failed:', err)
    );

    return { statusCode: 200, body: JSON.stringify({ backlog: backlogScheduled.length, added: newLeads.length, scheduled: scheduledCount }) };
  } catch (err) {
    console.error('[auto-lead-gen] Fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
