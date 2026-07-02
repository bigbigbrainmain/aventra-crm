const { TABS, rowToLead, rowToScheduled, getRange, appendRow, genId, ensureTab, isGenericInbox } = require('./_sheets');

const SCHEDULED_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email', 'Type'];

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

// Per-DAY target for new cold emails (not per-run). The two daily runs
// (07:00, 12:00) each top the day's tally up toward this number, so the noon
// run backfills whatever the morning run fell short of. OUTREACH_DAILY_TARGET
// is the canonical name; OUTREACH_PER_RUN is still read for back-compat.
const DAILY_TARGET = parseInt(process.env.OUTREACH_DAILY_TARGET || process.env.OUTREACH_PER_RUN || '20');
const APP_URL = process.env.APP_URL || 'https://aventra-crm.netlify.app';
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit', 'Replied']);

// Effort ceilings so "chase the target" can't run the function past Netlify's
// 26s wall-clock limit or hammer Places forever on a thin day.
// Ceiling on the search+scrape phase. Kept below the 26s function timeout with
// ~9s reserved for the pitch-generation + sheet-write phase that follows.
const TIME_BUDGET_MS = 17000;
const MAX_COMBOS = 30;           // distinct industry×city searches per run
const SCRAPE_CONCURRENCY = 12;   // sites scraped in parallel (each site also fetches its pages in parallel)
const PITCH_CONCURRENCY = 4;     // parallel Anthropic pitch generations

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Run up to `limit` async tasks at a time, preserving result order.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const EMAIL_NOISE = ['noreply', 'no-reply', '@example', '.png', '.jpg', '.svg', '@sentry', '@w3', 'schema.org'];

function extractEmail(html) {
  const matches = html.match(EMAIL_RE) || [];
  return matches.find(e => !EMAIL_NOISE.some(n => e.includes(n)) && !isGenericInbox(e)) || null;
}

const SCRAPE_PATHS = ['', '/contact', '/contact-us', '/about'];
const SCRAPE_TIMEOUT_MS = 4000;

// Fetch the homepage + contact pages CONCURRENTLY rather than one-by-one. The
// old sequential version spent up to 4×5s on every email-less site, so a
// single slow site could eat the whole run's time budget. Now a site resolves
// in ~one timeout; we return the first email found, preferring earlier paths
// (homepage before /about).
async function scrapeEmail(website) {
  const base = website.startsWith('http') ? website.replace(/\/$/, '') : `https://${website.replace(/\/$/, '')}`;
  const found = await Promise.all(SCRAPE_PATHS.map(async (path) => {
    try {
      const res = await fetch(base + path, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return extractEmail(await res.text());
    } catch { return null; }
  }));
  return found.find(Boolean) || null;
}

async function generatePitch(lead) {
  const hasWebsite = !!lead.website;
  const reviewLine = lead.reviewCount > 0
    ? `- Google Reviews: ${lead.reviewCount} reviews, ${lead.avgRating}★ average`
    : null;

  const prompt = `Write a short cold outreach email from Joe at Aventra, a UK web design agency.

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

// Search one industry×city on Google Places and return new-name candidates,
// deduped against `existingNames` (which is mutated to include the hits so the
// same business is never returned twice within a run).
async function placesSearch({ industry, city }, googleKey, existingNames) {
  const out = [];
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
    if (!placesRes.ok) return out;
    const placesData = await placesRes.json();
    for (const place of (placesData.places || [])) {
      const name = place.displayName?.text || '';
      if (!name || existingNames.has(name.toLowerCase().trim())) continue;
      existingNames.add(name.toLowerCase().trim());
      out.push({
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
    }
  } catch (err) {
    console.error(`[auto-lead-gen] Places error for ${industry}/${city}:`, err.message);
  }
  return out;
}

async function sendSummaryEmail(backlogLeads, newLeads, scheduledCount, dayTotal, target) {
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
      <p style="font-size: 13px; color: #6b7280; margin: 0 0 16px;">
        ${dayTotal}/${target} new emails queued today${dayTotal < target ? ` — ${target - dayTotal} short (backlog + findable emails ran low)` : ' ✓ target met'}
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
  const startTime = Date.now();
  const timeLeft = () => Date.now() - startTime < TIME_BUDGET_MS;
  try {
    const googleKey = process.env.GOOGLE_API_KEY;
    if (!googleKey) { console.log('[auto-lead-gen] No GOOGLE_API_KEY'); return { statusCode: 200, body: 'skipped' }; }

    await ensureTab(TABS.SCHEDULED, SCHEDULED_HEADERS);

    // Read lead data and scheduled queue together (A2:K to see the Type column)
    const [existingRows, schedRows] = await Promise.all([
      getRange(TABS.LEADS, 'A2:Z'),
      getRange(TABS.SCHEDULED, 'A2:K'),
    ]);
    const existingNames = new Set(existingRows.map(r => String(r[1] || '').toLowerCase().trim()));
    const scheduled = schedRows.map((r, i) => rowToScheduled(r, i + 2));

    // Skip leads that already have a pending email queued
    const alreadyPending = new Set(
      scheduled.filter(s => s.status === 'pending').map(s => s.leadId)
    );

    // Per-day top-up: count new emails already queued today (across earlier
    // runs), then only schedule the shortfall toward DAILY_TARGET. sent/pending
    // count; skipped/failed don't, so those slots get refilled.
    const todayStr = new Date().toISOString().slice(0, 10);
    const scheduledNewToday = scheduled.filter(s =>
      s.type === 'new' &&
      s.createdAt.slice(0, 10) === todayStr &&
      s.status !== 'skipped' && s.status !== 'failed'
    ).length;
    const target = Math.max(0, DAILY_TARGET - scheduledNewToday);

    if (target === 0) {
      console.log(`[auto-lead-gen] Daily target ${DAILY_TARGET} already met (${scheduledNewToday} queued today) — nothing to do`);
      return { statusCode: 200, body: JSON.stringify({ scheduled: 0, dayTotal: scheduledNewToday, target: DAILY_TARGET }) };
    }

    // Backlog: leads with email found, never contacted, not dead/opted-out, not already queued
    const backlog = existingRows
      .map((row, i) => rowToLead(row, i + 2))
      .filter(l =>
        l.id &&
        l.email &&
        !isGenericInbox(l.email) &&
        l.outreachCount === 0 &&
        !DEAD_STATUSES.has(l.status) &&
        l.outreachOptedOut !== 'Yes' &&
        !l.priorityReason.includes('email:not-found') &&
        !alreadyPending.has(l.id)
      );

    console.log(`[auto-lead-gen] Target ${target} (already ${scheduledNewToday}/${DAILY_TARGET} today) · backlog ${backlog.length}`);

    function randomSendTime() {
      const d = new Date();
      if (d.getHours() >= 16) d.setDate(d.getDate() + 1);
      d.setHours(9 + Math.floor(Math.random() * 7), Math.floor(Math.random() * 60), 0, 0);
      // Skip weekends — B2B cold sends land far better on weekdays
      const day = d.getDay();
      if (day === 6) d.setDate(d.getDate() + 2);       // Sat -> Mon
      else if (day === 0) d.setDate(d.getDate() + 1);  // Sun -> Mon
      return d.toISOString();
    }
    const now = new Date().toISOString();
    const backlogScheduled = [];

    // Phase 1 — backlog (leads already have emails, so just need a pitch each).
    // Generate pitches in parallel, then append up to the target.
    if (backlog.length && timeLeft()) {
      const picks = backlog.slice(0, target);
      const pitched = await mapLimit(picks, PITCH_CONCURRENCY, async (lead) => {
        try { return { lead, pitch: await generatePitch(lead) }; }
        catch (err) { console.error(`[auto-lead-gen] Backlog pitch failed for ${lead.businessName}:`, err.message); return null; }
      });
      for (const p of pitched) {
        if (!p || backlogScheduled.length >= target) continue;
        const schedId = genId('sched');
        await appendRow(TABS.SCHEDULED, [
          schedId, p.lead.id, p.lead.businessName, p.pitch.subject, p.pitch.body,
          randomSendTime(), 'pending', now, '', p.lead.email, 'new',
        ]);
        backlogScheduled.push(p.lead);
        console.log(`[auto-lead-gen] Backlog scheduled: ${p.lead.businessName} (${p.lead.email})`);
      }
    }

    // Phase 2 — fill the remaining slots with fresh leads from Google Places.
    // Keep searching new industry×city combos and scraping their sites (in
    // parallel) until the shortfall is filled, or the combo/time ceiling hits.
    const remainingSlots = target - backlogScheduled.length;
    const newLeads = [];   // leads with a usable email found this run

    if (remainingSlots > 0) {
      const usedCombos = new Set();
      while (newLeads.length < remainingSlots && usedCombos.size < MAX_COMBOS && timeLeft()) {
        // Pick a fresh combo not yet searched this run
        let combo, guard = 0;
        do { combo = { industry: pick(INDUSTRIES), city: pick(CITIES) }; guard++; }
        while (usedCombos.has(`${combo.industry}|${combo.city}`) && guard < 50);
        usedCombos.add(`${combo.industry}|${combo.city}`);

        console.log(`[auto-lead-gen] Searching: ${combo.industry} in ${combo.city}`);
        const candidates = await placesSearch(combo, googleKey, existingNames);

        // Scrape this combo's candidates in parallel batches, harvesting emails
        for (let b = 0; b < candidates.length && newLeads.length < remainingSlots && timeLeft(); b += SCRAPE_CONCURRENCY) {
          const batch = candidates.slice(b, b + SCRAPE_CONCURRENCY);
          const emails = await mapLimit(batch, SCRAPE_CONCURRENCY, (c) => c.website ? scrapeEmail(c.website) : Promise.resolve(null));
          for (let k = 0; k < batch.length && newLeads.length < remainingSlots; k++) {
            if (!emails[k]) continue;   // no usable email → drop the business
            batch[k].email = emails[k];
            newLeads.push(batch[k]);
          }
        }
      }
      if (newLeads.length < remainingSlots) {
        console.log(`[auto-lead-gen] Stopped at ${newLeads.length}/${remainingSlots} new leads (combos ${usedCombos.size}/${MAX_COMBOS}, ${timeLeft() ? 'combos exhausted' : 'time budget hit'})`);
      }
    }

    // Phase 3 — write the new leads: pitches in parallel, then append the
    // Leads + Scheduled rows for the ones that generated cleanly.
    const newScheduled = [];
    if (newLeads.length) {
      const pitched = await mapLimit(newLeads, PITCH_CONCURRENCY, async (lead) => {
        try { return { lead, pitch: await generatePitch(lead) }; }
        catch (err) { console.error(`[auto-lead-gen] Pitch failed for ${lead.businessName}:`, err.message); return null; }
      });
      for (const p of pitched) {
        if (!p) continue;
        const { lead, pitch } = p;
        try {
          await appendRow(TABS.LEADS, [
            lead.id, lead.businessName, lead.industry, lead.city,
            lead.email, lead.phone, lead.website,
            '', '', 'New', '', '', '', '', 'No', 'FALSE',
            '', '', '', '', '', '', '', '',
            lead.reviewCount || 0, lead.avgRating || 0, 'auto',
          ]);
          const schedId = genId('sched');
          await appendRow(TABS.SCHEDULED, [
            schedId, lead.id, lead.businessName, pitch.subject, pitch.body,
            randomSendTime(), 'pending', now, '', lead.email, 'new',
          ]);
          newScheduled.push(lead);
          console.log(`[auto-lead-gen] New lead scheduled: ${lead.businessName} (${lead.email})`);
        } catch (err) {
          console.error(`[auto-lead-gen] Failed to write ${lead.businessName}:`, err.message);
        }
      }
    }

    const scheduledCount = backlogScheduled.length + newScheduled.length;
    const dayTotal = scheduledNewToday + scheduledCount;
    console.log(`[auto-lead-gen] Done — scheduled ${scheduledCount} this run, ${dayTotal}/${DAILY_TARGET} today`);

    await sendSummaryEmail(backlogScheduled, newScheduled, scheduledCount, dayTotal, DAILY_TARGET).catch(err =>
      console.error('[auto-lead-gen] Summary email failed:', err)
    );

    return { statusCode: 200, body: JSON.stringify({ backlog: backlogScheduled.length, added: newScheduled.length, scheduled: scheduledCount, dayTotal, target: DAILY_TARGET }) };
  } catch (err) {
    console.error('[auto-lead-gen] Fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
