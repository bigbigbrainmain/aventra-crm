const { TABS, rowToLead, getRange, updateCell } = require('./_sheets');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

async function fetchHtml(url, timeoutMs = 4000) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return await res.text();
  } catch { /* timeout or network error */ }
  return null;
}

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

  const listingHtml = await fetchHtml(listingUrl);
  if (!listingHtml) return [null, null];

  return [extractEmail(listingHtml), extractPhone(listingHtml)];
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

async function enrichViaDirectories(lead) {
  for (const dir of DIRECTORIES) {
    try {
      const [email, phone] = await findInDirectory(dir.url(lead.businessName, lead.city), dir.test, dir.base);
      if (email) {
        console.log(`[enrich-dirs] ✓ ${lead.businessName}: ${email} via ${dir.name}`);
        return { email, phone, source: dir.name };
      }
    } catch (err) {
      console.error(`[enrich-dirs] ${dir.name} error for ${lead.businessName}:`, err.message);
    }
  }
  return null;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const limit = parseInt(params.limit || '5');
  const offset = parseInt(params.offset || '0');

  const rows = await getRange(TABS.LEADS, 'A2:AA');
  const targets = rows
    .map((row, i) => ({ lead: rowToLead(row, i + 2), rowNum: i + 2 }))
    .filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:not-found');

  const batch = targets.slice(offset, offset + limit);
  const remaining = Math.max(0, targets.length - offset - batch.length);

  console.log(`[enrich-dirs] Processing ${batch.length}/${targets.length} (offset=${offset}, ${remaining} remaining)`);

  const stats = { found: 0, notFound: 0, errors: 0, total: batch.length, remaining, nextOffset: offset + batch.length };

  for (const { lead, rowNum } of batch) {
    try {
      const result = await enrichViaDirectories(lead);
      if (result) {
        await updateCell(TABS.LEADS, `E${rowNum}`, result.email);
        await updateCell(TABS.LEADS, `I${rowNum}`, '');
        if (result.phone && !lead.phone) await updateCell(TABS.LEADS, `F${rowNum}`, result.phone);
        stats.found++;
      } else {
        await updateCell(TABS.LEADS, `I${rowNum}`, 'email:dirs-tried');
        stats.notFound++;
        console.log(`[enrich-dirs] ✗ ${lead.businessName}: not found in any directory`);
      }
    } catch (err) {
      console.error(`[enrich-dirs] Error for ${lead.businessName}:`, err.message);
      stats.errors++;
    }
  }

  console.log(`[enrich-dirs] Done: ${stats.found} found, ${stats.notFound} not found, ${stats.errors} errors`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(stats),
  };
};
