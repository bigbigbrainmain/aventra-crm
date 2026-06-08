/**
 * Backfill email enrichment - HTTP-triggered, paginate to completion.
 *
 * Pass 1 (dirs): processes leads tagged email:not-found through 6 UK directories
 * Pass 2 (claude): processes leads tagged email:dirs-tried through a Claude browsing agent
 *
 * Usage:
 *   GET /.netlify/functions/backfill-email-enrichment?pass=estimate
 *       → returns counts and estimated Claude cost for the full backfill
 *
 *   GET /.netlify/functions/backfill-email-enrichment?pass=dirs&limit=15&offset=0
 *       → runs directory pass on next 15 email:not-found leads
 *
 *   GET /.netlify/functions/backfill-email-enrichment?pass=claude&limit=5&offset=0
 *       → runs Claude pass on next 5 email:dirs-tried leads
 *
 * Repeat with increasing offset (returned as nextOffset) until remaining=0.
 * Run dirs pass first, then claude pass.
 */

const { TABS, rowToLead, getRange, updateCell } = require('./_sheets');
const dns = require('dns').promises;

async function hasMxRecord(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch { return false; }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const EXCLUDED_DOMAINS = new Set([
  'example.com', 'sentry.io', 'wixpress.com', 'squarespace.com', 'wordpress.com',
  'google.com', 'facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com',
  'linkedin.com', 'amazonaws.com', 'cloudfront.net', 'mailchimp.com',
  'godaddy.com', 'ionos.com', 'yell.com', 'freeindex.co.uk', 'thomsonlocal.com',
  'bing.com', 'microsoft.com', 'w3.org', 'schema.org', 'googleapis.com',
  '192.com', 'hotfrog.co.uk', 'cylex-uk.co.uk', 'local.co.uk',
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

function extractEmail(html) {
  const mailtoRe = /href=["']mailto:([^"'?\s]+)/gi;
  let m;
  while ((m = mailtoRe.exec(html)) !== null) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (isValidEmail(e)) return e;
  }
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let match;
  while ((match = EMAIL_RE.exec(html)) !== null) {
    const e = match[0].toLowerCase();
    if (isValidEmail(e)) return e;
  }
  return null;
}

function extractPhone(html) {
  const m = /href=["']tel:([^"'\s]+)/i.exec(html);
  return m ? m[1].trim() : null;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchHtml(url, timeoutMs = 5000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return await res.text();
  } catch { /* timeout */ }
  return null;
}

// ── Directory pass ────────────────────────────────────────────────────────────

async function findInDirectory(searchUrl, linkTest, baseUrl) {
  const searchHtml = await fetchHtml(searchUrl);
  if (!searchHtml) return [null, null];
  const linkRe = /href=["']([^"']+)["']/g;
  let m, listingUrl = null;
  while ((m = linkRe.exec(searchHtml)) !== null) {
    if (linkTest(m[1])) {
      listingUrl = m[1].startsWith('http') ? m[1] : baseUrl + m[1];
      break;
    }
  }
  if (!listingUrl) return [null, null];
  const html = await fetchHtml(listingUrl);
  if (!html) return [null, null];
  return [extractEmail(html), extractPhone(html)];
}

const DIRECTORIES = [
  {
    name: '192.com',
    url: (n, c) => `https://www.192.com/search/?type=business&query=${encodeURIComponent(n + ' ' + c)}`,
    test: h => /\/atoz\/business\/|\/business\/[^?#]/.test(h) && !h.includes('192.com/search'),
    base: 'https://www.192.com',
  },
  {
    name: 'Hotfrog',
    url: (n, c) => `https://www.hotfrog.co.uk/search/uk/${encodeURIComponent(c)}/${encodeURIComponent(n)}`,
    test: h => h.includes('/company/'),
    base: 'https://www.hotfrog.co.uk',
  },
  {
    name: 'Cylex',
    url: (n, c) => `https://www.cylex-uk.co.uk/search.html?q=${encodeURIComponent(n)}&where=${encodeURIComponent(c)}`,
    test: h => h.includes('/company/') && h.endsWith('.html'),
    base: 'https://www.cylex-uk.co.uk',
  },
  {
    name: 'FreeIndex',
    url: (n, c) => `https://www.freeindex.co.uk/search.htm?query=${encodeURIComponent(n + ' ' + c)}`,
    test: h => h.includes('/profile/') && h.includes('~'),
    base: 'https://www.freeindex.co.uk',
  },
  {
    name: 'Thomson Local',
    url: (n, c) => `https://www.thomsonlocal.com/search/${encodeURIComponent(n)}/${encodeURIComponent(c)}`,
    test: h => h.includes('/business/'),
    base: 'https://www.thomsonlocal.com',
  },
  {
    name: 'Local.co.uk',
    url: (n, c) => `https://www.local.co.uk/search?q=${encodeURIComponent(n)}&location=${encodeURIComponent(c)}`,
    test: h => /\/profile\/|\/listing\/|\/business\//.test(h),
    base: 'https://www.local.co.uk',
  },
];

async function runDirsOnLead(lead) {
  for (const dir of DIRECTORIES) {
    try {
      const [email, phone] = await findInDirectory(dir.url(lead.businessName, lead.city), dir.test, dir.base);
      if (email) return { email, phone, source: dir.name };
    } catch { /* continue */ }
  }
  return null;
}

// ── Google CSE pass ───────────────────────────────────────────────────────────

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
    if (email) { console.log(`[backfill-claude] found in snippet: ${email}`); return email; }
  }

  // Pass 2: fetch top result pages
  for (const item of items1.slice(0, 2)) {
    if (!item.link) continue;
    const html = await fetchHtml(item.link);
    if (!html) continue;
    const email = extractEmail(html);
    if (email) { console.log(`[backfill-claude] found in page (${item.link}): ${email}`); return email; }
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
    if (email) { console.log(`[backfill-claude] found in directory (${item.link}): ${email}`); return email; }
  }

  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const pass = params.pass || 'estimate';
  const limit = parseInt(params.limit || (pass === 'dirs' ? '3' : '5'));
  const offset = parseInt(params.offset || '0');

  const rows = await getRange(TABS.LEADS, 'A2:AB');
  const leads = rows.map((row, i) => ({ lead: rowToLead(row, i + 2), rowNum: i + 2 }));

  // ── Estimate mode ─────────────────────────────────────────────────────────
  if (pass === 'estimate') {
    const dirsCount = leads.filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:not-found').length;
    const googleCseCount = leads.filter(({ lead }) => lead.id && !lead.email && (lead.priorityReason === 'email:dirs-tried' || lead.priorityReason === 'email:all-tried')).length;
    const claudeQueueCount = leads.filter(({ lead }) => lead.id && !lead.email && !lead.emailEnriched).length;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        dirsQueueSize: dirsCount,
        googleCseQueueSize: googleCseCount,
        claudeAutoQueueSize: claudeQueueCount,
        note: 'Dirs + Google CSE pass run here. Claude AI enrichment runs automatically every 30 min via scheduled background function.',
      }),
    };
  }

  // ── Reset pass: marks email:all-tried leads back to email:dirs-tried ─────────
  if (pass === 'reset-all-tried') {
    const targets = leads.filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:all-tried');
    const batch = targets.slice(offset, offset + limit);
    const remaining = Math.max(0, targets.length - offset - batch.length);
    let reset = 0;
    for (const { lead, rowNum } of batch) {
      try {
        await updateCell(TABS.LEADS, `I${rowNum}`, 'email:dirs-tried');
        reset++;
        console.log(`[backfill-reset] reset ${lead.businessName}`);
      } catch (err) {
        console.error(`[backfill-reset] Error ${lead.businessName}:`, err.message);
      }
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ pass: 'reset-all-tried', reset, total: batch.length, remaining, nextOffset: offset + batch.length }),
    };
  }

  // ── Directories pass ──────────────────────────────────────────────────────
  if (pass === 'dirs') {
    const targets = leads.filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:not-found');
    const batch = targets.slice(offset, offset + limit);
    const remaining = Math.max(0, targets.length - offset - batch.length);
    const stats = { pass: 'dirs', found: 0, notFound: 0, errors: 0, total: batch.length, remaining, nextOffset: offset + batch.length };

    for (const { lead, rowNum } of batch) {
      try {
        const result = await runDirsOnLead(lead);
        const mxOk = result ? await hasMxRecord(result.email.split('@')[1]) : false;
        if (result && mxOk) {
          await updateCell(TABS.LEADS, `E${rowNum}`, result.email);
          await updateCell(TABS.LEADS, `I${rowNum}`, '');
          if (result.phone && !lead.phone) await updateCell(TABS.LEADS, `F${rowNum}`, result.phone);
          stats.found++;
          console.log(`[backfill-dirs] ✓ ${lead.businessName}: ${result.email} (${result.source})`);
        } else {
          await updateCell(TABS.LEADS, `I${rowNum}`, 'email:dirs-tried');
          stats.notFound++;
          if (result && !mxOk) console.log(`[backfill-dirs] ✗ ${lead.businessName}: email found but no MX record (${result.email})`);
        }
      } catch (err) {
        console.error(`[backfill-dirs] Error ${lead.businessName}:`, err.message);
        stats.errors++;
      }
    }

    if (remaining === 0) stats.message = 'Directories pass complete. Now run ?pass=claude to process remaining leads.';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(stats),
    };
  }

  // ── Google CSE pass (formerly Claude pass) ───────────────────────────────
  if (pass === 'claude') {
    const key = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CSE_CX;
    if (!key || !cx) {
      return { statusCode: 200, body: JSON.stringify({ error: 'GOOGLE_API_KEY or GOOGLE_CSE_CX not set' }) };
    }

    const targets = leads.filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:dirs-tried');
    const batch = targets.slice(offset, offset + limit);
    const remaining = Math.max(0, targets.length - offset - batch.length);
    const stats = { pass: 'claude', found: 0, notFound: 0, errors: 0, total: batch.length, remaining, nextOffset: offset + batch.length };

    for (const { lead, rowNum } of batch) {
      try {
        const email = await findEmailViaGoogle(lead);
        const mxOk = email ? await hasMxRecord(email.split('@')[1]) : false;
        if (email && mxOk) {
          await updateCell(TABS.LEADS, `E${rowNum}`, email);
          await updateCell(TABS.LEADS, `I${rowNum}`, '');
          stats.found++;
          console.log(`[backfill-claude] ✓ ${lead.businessName}: ${email}`);
        } else {
          await updateCell(TABS.LEADS, `I${rowNum}`, 'email:all-tried');
          stats.notFound++;
          console.log(`[backfill-claude] ✗ ${lead.businessName}: not found`);
        }
      } catch (err) {
        console.error(`[backfill-claude] Error ${lead.businessName}:`, err.message);
        stats.errors++;
      }
    }

    if (remaining === 0) stats.message = 'Google CSE pass complete. All leads processed.';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(stats),
    };
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Invalid pass. Use: estimate, dirs, or claude' }),
  };
};
