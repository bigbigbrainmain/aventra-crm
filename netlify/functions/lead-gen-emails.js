const { TABS, getRange, updateRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const NOISE = ['noreply', 'no-reply', '@example', '.png', '.jpg', '.svg', '@sentry', '@w3', 'schema.org', 'email@'];

function extractEmail(html) {
  const matches = html.match(EMAIL_RE) || [];
  return matches.find(e => !NOISE.some(n => e.includes(n))) || null;
}

async function scrapeEmail(rawWebsite) {
  const base = rawWebsite.startsWith('http') ? rawWebsite.replace(/\/$/, '') : `https://${rawWebsite.replace(/\/$/, '')}`;
  const paths = ['', '/contact', '/contact-us', '/about', '/about-us'];

  for (const path of paths) {
    try {
      const res = await fetch(base + path, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AventraCRM/1.0)' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      const email = extractEmail(text);
      if (email) return email;
    } catch {
      // continue to next path
    }
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { leadIds } = JSON.parse(event.body || '{}');
    if (!leadIds || !leadIds.length) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'leadIds required' }) };

    const rows = await getRange(TABS.LEADS, 'A2:X');
    const leadSet = new Set(leadIds);
    const results = [];

    for (const [i, row] of rows.entries()) {
      const id = String(row[0] || '');
      if (!leadSet.has(id)) continue;

      const website = String(row[6] || '');
      let email = null;

      if (website) {
        email = await scrapeEmail(website);
      }

      if (email) {
        const rowNum = i + 2;
        await updateRow(TABS.LEADS, rowNum, [row[0], row[1], row[2], row[3], email]);
      }

      results.push({ id, businessName: String(row[1] || ''), email, found: !!email });
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ results }) };
  } catch (err) {
    console.error('lead-gen-emails error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
