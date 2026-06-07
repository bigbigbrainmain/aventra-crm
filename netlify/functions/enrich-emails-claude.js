const { TABS, rowToLead, getRange, updateCell } = require('./_sheets');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const EXCLUDED_DOMAINS = new Set([
  'example.com', 'sentry.io', 'wixpress.com', 'squarespace.com', 'wordpress.com',
  'google.com', 'facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com',
  'linkedin.com', 'amazonaws.com', 'cloudfront.net', 'mailchimp.com',
  'godaddy.com', 'ionos.com', 'yell.com', 'bing.com', 'microsoft.com',
  'w3.org', 'schema.org', 'googleapis.com',
]);

const EXCLUDED_PREFIXES = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'webmaster', 'postmaster', 'bounce', 'mailer-daemon',
  'privacy', 'legal', 'abuse', 'spam',
]);

function isValidEmail(email) {
  if (!email || !email.includes('@')) return false;
  const [prefix, domain] = email.toLowerCase().split('@');
  if (!domain || !prefix) return false;
  if (EXCLUDED_DOMAINS.has(domain)) return false;
  if ([...EXCLUDED_DOMAINS].some(d => domain.endsWith('.' + d))) return false;
  if (EXCLUDED_PREFIXES.has(prefix)) return false;
  if (/\.(png|jpg|gif|svg|webp)$/i.test(email)) return false;
  return true;
}

function extractEmail(text) {
  // Try mailto links first (for HTML)
  const mailtoRe = /href=["']mailto:([^"'?\s]+)/gi;
  let m;
  while ((m = mailtoRe.exec(text)) !== null) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (isValidEmail(e)) return e;
  }
  // Then plain email pattern (works on both HTML and plain text snippets)
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let match;
  while ((match = EMAIL_RE.exec(text)) !== null) {
    const e = match[0].toLowerCase();
    if (isValidEmail(e)) return e;
  }
  return null;
}

async function fetchHtml(url, timeoutMs = 4000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return await res.text();
  } catch { /* timeout or network error */ }
  return null;
}

async function searchGoogleCSE(query, key, cx) {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch { return []; }
}

async function findEmailViaGoogle(lead) {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return null;

  // Pass 1: search snippets directly for email address
  const items1 = await searchGoogleCSE(
    `"${lead.businessName}" "${lead.city}" email contact`,
    key, cx
  );
  for (const item of items1) {
    const email = extractEmail((item.snippet || '') + ' ' + (item.title || ''));
    if (email) { console.log(`[enrich-claude] found in snippet: ${email}`); return email; }
  }

  // Pass 2: fetch top result pages
  for (const item of items1.slice(0, 2)) {
    if (!item.link) continue;
    const html = await fetchHtml(item.link);
    if (!html) continue;
    const email = extractEmail(html);
    if (email) { console.log(`[enrich-claude] found in page (${item.link}): ${email}`); return email; }
  }

  // Pass 3: look for directory listings (yell, checkatrade, etc.)
  const items2 = await searchGoogleCSE(
    `"${lead.businessName}" "${lead.city}" site:yell.com OR site:checkatrade.com OR site:ratedpeople.com OR site:trustatrader.com`,
    key, cx
  );
  for (const item of items2.slice(0, 2)) {
    if (!item.link) continue;
    const html = await fetchHtml(item.link);
    if (!html) continue;
    const email = extractEmail(html);
    if (email) { console.log(`[enrich-claude] found in directory (${item.link}): ${email}`); return email; }
  }

  return null;
}

exports.handler = async (event) => {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) {
    return { statusCode: 200, body: JSON.stringify({ error: 'GOOGLE_API_KEY or GOOGLE_CSE_CX not set' }) };
  }

  const params = event.queryStringParameters || {};
  const limit = parseInt(params.limit || '3');
  const offset = parseInt(params.offset || '0');

  const rows = await getRange(TABS.LEADS, 'A2:AB');
  const targets = rows
    .map((row, i) => ({ lead: rowToLead(row, i + 2), rowNum: i + 2 }))
    .filter(({ lead }) => lead.id && !lead.email && !lead.emailEnriched);

  const batch = targets.slice(offset, offset + limit);
  const remaining = Math.max(0, targets.length - offset - batch.length);

  console.log(`[enrich-claude] Processing ${batch.length}/${targets.length} (offset=${offset}, ${remaining} remaining)`);

  const stats = { found: 0, notFound: 0, errors: 0, total: batch.length, remaining, nextOffset: offset + batch.length };

  for (const { lead, rowNum } of batch) {
    try {
      const email = await findEmailViaGoogle(lead);
      if (email) {
        await updateCell(TABS.LEADS, `E${rowNum}`, email);
        await updateCell(TABS.LEADS, `I${rowNum}`, '');
        stats.found++;
        console.log(`[enrich-claude] ✓ ${lead.businessName}: ${email}`);
      } else {
        await updateCell(TABS.LEADS, `I${rowNum}`, 'email:all-tried');
        stats.notFound++;
        console.log(`[enrich-claude] ✗ ${lead.businessName}: not found`);
      }
    } catch (err) {
      console.error(`[enrich-claude] Error for ${lead.businessName}:`, err.message);
      stats.errors++;
    }
  }

  console.log(`[enrich-claude] Done: ${stats.found} found, ${stats.notFound} not found, ${stats.errors} errors`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(stats),
  };
};
