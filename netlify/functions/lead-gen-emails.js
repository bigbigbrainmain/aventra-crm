const { TABS, getRange, updateCell } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const EXCLUDED_DOMAINS = new Set([
  'example.com', 'sentry.io', 'wixpress.com', 'squarespace.com', 'wordpress.com',
  'google.com', 'facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com',
  'linkedin.com', 'amazonaws.com', 'cloudfront.net', 'mailchimp.com', 'godaddy.com',
  'ionos.com', 'hostgator.com', 'bluehost.com', 'namecheap.com', 'yell.com',
  'freeindex.co.uk', 'thomsonlocal.com', 'bing.com', 'microsoft.com',
  'w3.org', 'schema.org', 'googleapis.com', 'gstatic.com',
]);

const EXCLUDED_PREFIXES = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'webmaster', 'postmaster', 'bounce', 'mailer-daemon',
  'privacy', 'legal', 'abuse', 'spam', 'support',
]);

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const MAILTO_RE = /href=["']mailto:([^"'?\s]+)/gi;
const TEL_RE = /href=["']tel:([^"'?\s]+)/gi;
const PHONE_RE = /(?:(?:\+44|0044|0)[\s\-]?(?:\d[\s\-]?){9,10})/g;

function isValidEmail(email) {
  if (!email.includes('@')) return false;
  const [prefix, domain] = email.toLowerCase().split('@');
  if (!domain) return false;
  if (EXCLUDED_DOMAINS.has(domain)) return false;
  if ([...EXCLUDED_DOMAINS].some(d => domain.endsWith('.' + d))) return false;
  if (EXCLUDED_PREFIXES.has(prefix)) return false;
  if (/\.(png|jpg|gif|svg|webp)$/i.test(email)) return false;
  return true;
}

function extractEmails(html) {
  const found = [];
  let m;
  const mailtoRe = new RegExp(MAILTO_RE.source, 'gi');
  while ((m = mailtoRe.exec(html)) !== null) {
    const email = decodeURIComponent(m[1]).trim().toLowerCase();
    if (EMAIL_RE.test(email) && isValidEmail(email)) found.push(email);
  }
  if (found.length) return [...new Set(found)];
  const emailRe = new RegExp(EMAIL_RE.source, 'gi');
  while ((m = emailRe.exec(html)) !== null) {
    const email = m[0].toLowerCase();
    if (isValidEmail(email)) found.push(email);
  }
  return [...new Set(found)];
}

function extractPhone(html) {
  const telRe = new RegExp(TEL_RE.source, 'gi');
  let m = telRe.exec(html);
  if (m) return m[1].trim();
  const phoneRe = new RegExp(PHONE_RE.source, 'g');
  m = phoneRe.exec(html);
  return m ? m[0].trim() : null;
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (res.status < 400) return res.text();
  } catch { /* ignore */ }
  return null;
}

// Strategy 1: scrape own website
async function scrapeWebsite(website) {
  if (!website) return { email: null, phone: null };
  if (!website.startsWith('http')) website = 'https://' + website;

  const paths = ['', '/contact', '/contact-us', '/about', '/about-us', '/get-in-touch'];
  const base = new URL(website).origin;

  for (const path of paths) {
    const url = path ? base + path : website;
    const html = await fetchHtml(url);
    if (!html) continue;
    const emails = extractEmails(html);
    if (emails.length) return { email: emails[0], phone: extractPhone(html) };
  }
  return { email: null, phone: null };
}

// Strategy 2: Bing search
async function searchBing(name, city) {
  try {
    const q = encodeURIComponent(`"${name}" "${city}" email contact`);
    const html = await fetchHtml(`https://www.bing.com/search?q=${q}&mkt=en-GB&count=5`);
    if (!html) return { email: null, phone: null };

    // Check snippets first
    const emails = extractEmails(html);
    if (emails.length) return { email: emails[0], phone: null };

    // Follow top result links
    const linkRe = /<a[^>]+href="(https?:\/\/(?!.*bing\.com)[^"]+)"[^>]*><h2/gi;
    const links = [];
    let m;
    while ((m = linkRe.exec(html)) !== null && links.length < 3) links.push(m[1]);

    for (const link of links) {
      const pageHtml = await fetchHtml(link);
      if (!pageHtml) continue;
      const pageEmails = extractEmails(pageHtml);
      if (pageEmails.length) return { email: pageEmails[0], phone: extractPhone(pageHtml) };
    }
  } catch { /* ignore */ }
  return { email: null, phone: null };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { limit = 5 } = JSON.parse(event.body || '{}');

    const rows = await getRange(TABS.LEADS, 'A2:H');
    const needsEmail = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = (row[4] || '').trim();
      const priority = (row[7] || '').trim();
      if (priority && !priority.includes('Skip') && !email) {
        needsEmail.push({
          rowNum: i + 2,
          name: (row[1] || '').trim(),
          city: (row[3] || '').trim(),
          website: (row[6] || '').trim(),
          hasPhone: !!(row[5] || '').trim(),
        });
      }
    }

    const batch = needsEmail.slice(0, Math.min(limit, 5));
    if (!batch.length) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: 0, remaining: 0, results: [] }) };
    }

    const results = [];
    for (const lead of batch) {
      let email = null;
      let phone = null;
      let source = null;

      const siteResult = await scrapeWebsite(lead.website);
      if (siteResult.email) { email = siteResult.email; phone = siteResult.phone; source = 'website'; }

      if (!email) {
        const bingResult = await searchBing(lead.name, lead.city);
        if (bingResult.email) { email = bingResult.email; phone = bingResult.phone; source = 'Bing'; }
      }

      if (email) {
        await updateCell(TABS.LEADS, `E${lead.rowNum}`, email);
        if (phone && !lead.hasPhone) await updateCell(TABS.LEADS, `F${lead.rowNum}`, phone);
      }

      results.push({ name: lead.name, email, source });
    }

    const found = results.filter(r => r.email).length;
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found, remaining: needsEmail.length - batch.length, results }),
    };
  } catch (err) {
    console.error('lead-gen-emails error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
