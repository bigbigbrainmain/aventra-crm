const { TABS, rowToLead, getRange, updateRow, updateCell } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const NOISE = ['noreply', 'no-reply', '@example', '.png', '.jpg', '.svg', '@sentry', '@w3', 'schema.org'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractEmail(html) {
  const matches = html.match(EMAIL_RE) || [];
  return matches.find(e => !NOISE.some(n => e.includes(n))) || null;
}

async function scrapeEmail(rawWebsite) {
  const base = rawWebsite.startsWith('http') ? rawWebsite.replace(/\/$/, '') : `https://${rawWebsite.replace(/\/$/, '')}`;
  for (const path of ['', '/contact', '/contact-us', '/about', '/about-us']) {
    try {
      const res = await fetch(base + path, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const email = extractEmail(await res.text());
      if (email) return email;
    } catch { /* continue */ }
  }
  return null;
}

exports.handler = async (event) => {
  try {
    const offset = parseInt(event.queryStringParameters?.offset || '0');
    const limit = parseInt(event.queryStringParameters?.limit || '20');

    const rows = await getRange(TABS.LEADS, 'A2:X');
    const all = rows
      .map((row, i) => ({ lead: rowToLead(row, i + 2), rowNum: i + 2 }))
      .filter(({ lead }) => lead.id && lead.website && !lead.email && lead.priorityReason !== 'email:not-found');

    const batch = all.slice(offset, offset + limit);
    const remaining = Math.max(0, all.length - offset - batch.length);

    console.log(`[backfill-emails] batch ${offset}-${offset + batch.length} of ${all.length}`);

    const results = { found: 0, notFound: 0, errors: 0 };

    for (const { lead, rowNum } of batch) {
      try {
        const email = await scrapeEmail(lead.website);
        if (email) {
          await updateRow(TABS.LEADS, rowNum, [lead.id, lead.businessName, lead.industry, lead.city, email]);
          results.found++;
          console.log(`[backfill-emails] ✓ ${lead.businessName}: ${email}`);
        } else {
          await updateCell(TABS.LEADS, `I${rowNum}`, 'email:not-found');
          results.notFound++;
          console.log(`[backfill-emails] ✗ ${lead.businessName}: not found`);
        }
      } catch (err) {
        results.errors++;
        console.error(`[backfill-emails] Error for ${lead.businessName}:`, err.message);
      }
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ processed: batch.length, remaining, nextOffset: offset + batch.length, ...results }),
    };
  } catch (err) {
    console.error('[backfill-emails] Fatal:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
