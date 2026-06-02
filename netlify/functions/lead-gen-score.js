const { TABS, getRange, updateRow } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function scoreToPriority(score) {
  if (score < 40) return { priority: 'Priority 1', reason: `PageSpeed score: ${score}/100 — major performance issues` };
  if (score < 60) return { priority: 'Priority 2', reason: `PageSpeed score: ${score}/100 — needs improvement` };
  if (score < 80) return { priority: 'Priority 3', reason: `PageSpeed score: ${score}/100 — moderate performance` };
  return { priority: 'Skip', reason: `PageSpeed score: ${score}/100 — already performing well` };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { leadIds } = JSON.parse(event.body || '{}');
    if (!leadIds || !leadIds.length) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'leadIds required' }) };

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'GOOGLE_API_KEY not configured', noKey: true }) };

    const rows = await getRange(TABS.LEADS, 'A2:X');
    const leadSet = new Set(leadIds);
    const results = [];

    for (const [i, row] of rows.entries()) {
      const id = String(row[0] || '');
      if (!leadSet.has(id)) continue;

      const website = String(row[6] || '');
      let score = null;

      if (website) {
        try {
          const url = website.startsWith('http') ? website : `https://${website}`;
          const psRes = await fetch(
            `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`,
            { signal: AbortSignal.timeout(20000) }
          );
          if (psRes.ok) {
            const psData = await psRes.json();
            score = Math.round((psData.lighthouseResult?.categories?.performance?.score || 0) * 100);
          }
        } catch (e) {
          console.error('PageSpeed error for', website, e.message);
        }
      }

      const { priority, reason } = score !== null
        ? scoreToPriority(score)
        : { priority: 'Priority 3', reason: website ? 'Could not load website' : 'No website found' };

      const rowNum = i + 2;
      await updateRow(TABS.LEADS, rowNum, [
        row[0], row[1], row[2], row[3], row[4], row[5], row[6],
        priority, reason,
      ]);

      results.push({ id, businessName: String(row[1] || ''), priority, reason, score });
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ results }) };
  } catch (err) {
    console.error('lead-gen-score error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
