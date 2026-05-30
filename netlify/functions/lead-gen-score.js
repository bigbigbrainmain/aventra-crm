const { TABS, getRange, updateRange } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAGESPEED_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CURRENT_YEAR = new Date().getFullYear();
const OLD_YEAR = CURRENT_YEAR - 2;

async function checkSite(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AventraLeadBot/1.0)' },
    });
    const html = res.status < 400 ? (await res.text()).slice(0, 50000) : '';
    return { reachable: res.status < 400, hasSSL: res.url.startsWith('https://'), status: res.status, html };
  } catch {
    return { reachable: false, hasSSL: false, status: 0, html: '' };
  }
}

function hasOldCopyright(html) {
  const matches = [...html.matchAll(/(?:©|&copy;|copyright|\(c\))[^\d]{0,30}(\d{4})/gi)];
  if (!matches.length) return false;
  const latest = Math.max(...matches.map(m => parseInt(m[1])));
  return latest <= OLD_YEAR;
}

async function getPagespeedScore(url) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;
  try {
    const params = new URLSearchParams({ url, key, strategy: 'mobile', category: 'performance' });
    const res = await fetch(`${PAGESPEED_URL}?${params}`, { signal: AbortSignal.timeout(25000) });
    const data = await res.json();
    const score = data?.lighthouseResult?.categories?.performance?.score;
    return score != null ? Math.round(score * 100) : null;
  } catch {
    return null;
  }
}

async function scoreLead(website) {
  if (!website) return { priority: '🔴 Priority 1', reason: 'No website listed' };

  const site = await checkSite(website);

  if (!site.reachable) {
    const reason = site.status ? `Site unreachable (status ${site.status})` : 'Site unreachable (connection error)';
    return { priority: '🔴 Priority 1', reason };
  }

  const oldCopyright = hasOldCopyright(site.html);
  const score = await getPagespeedScore(website);

  const p2 = [];
  if (score != null && score < 50) p2.push(`mobile score ${score}/100`);
  if (!site.hasSSL) p2.push('no SSL/HTTPS');
  if (oldCopyright) p2.push(`old copyright (≤${OLD_YEAR})`);
  if (p2.length) return { priority: '🟠 Priority 2', reason: p2.join('; ') };

  const p3 = [];
  if (score != null && score >= 50 && score <= 70) p3.push(`mobile score ${score}/100`);
  if (p3.length) return { priority: '🟡 Priority 3', reason: p3.join('; ') };

  const scoreStr = score != null ? `${score}/100` : 'unknown';
  return { priority: '🟢 Skip', reason: `Mobile score ${scoreStr}, HTTPS, no obvious issues` };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { limit = 5 } = JSON.parse(event.body || '{}');

    const rows = await getRange(TABS.LEADS, 'A2:I');
    const unscored = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!(row[7] || '').trim()) {
        unscored.push({ rowNum: i + 2, name: (row[1] || '').trim(), website: (row[6] || '').trim() });
      }
    }

    const batch = unscored.slice(0, Math.min(limit, 5));
    if (!batch.length) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ scored: 0, remaining: 0, results: [] }) };
    }

    const results = [];
    for (const lead of batch) {
      const { priority, reason } = await scoreLead(lead.website);
      await updateRange(TABS.LEADS, `H${lead.rowNum}`, [priority, reason]);
      results.push({ name: lead.name, priority, reason });
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ scored: results.length, remaining: unscored.length - results.length, results }),
    };
  } catch (err) {
    console.error('lead-gen-score error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
