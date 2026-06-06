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

// Haiku 4.5 pricing
const PRICE_INPUT_PER_M = 0.80;
const PRICE_OUTPUT_PER_M = 4.00;
const AVG_INPUT_TOKENS_PER_LEAD = 3500;
const AVG_OUTPUT_TOKENS_PER_LEAD = 250;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
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

// ── Claude pass ───────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_web',
    description: 'Search the web. Returns page text from search results.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'fetch_page',
    description: 'Fetch and read the text content of a web page.',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
];

const SYSTEM = `You find email addresses for UK small businesses.

Given a business name, city, and optional website, search for their real contact email.

Good sources: their website contact/about pages, yell.com, checkatrade.com, rated.people.com, trustatrader.com.

When you find a valid email address, reply with exactly:
FOUND: email@domain.com

If you cannot find one after searching, reply with exactly:
NOT_FOUND

Rules:
- Max 5 tool calls total — be efficient
- Skip noreply@, webmaster@, postmaster@ and platform emails (@wix.com, @squarespace.com)
- Real business emails only`;

async function doWebSearch(query) {
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=en-GB&count=5`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return `Search returned ${res.status}`;
    return stripHtml(await res.text()).substring(0, 3000);
  } catch { return 'Search timed out'; }
}

async function doFetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return `Page returned ${res.status}`;
    return stripHtml(await res.text()).substring(0, 4000);
  } catch { return 'Page fetch timed out'; }
}

async function runClaudeOnLead(lead) {
  const messages = [{
    role: 'user',
    content: `Find the contact email for: "${lead.businessName}" in ${lead.city}, UK.${lead.website ? ` Website: ${lead.website}` : ''} Industry: ${lead.industry}.`,
  }];

  let inputTokens = 0;
  let outputTokens = 0;

  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        tools: TOOLS,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    inputTokens += data.usage?.input_tokens || 0;
    outputTokens += data.usage?.output_tokens || 0;
    messages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason === 'end_turn') {
      const text = data.content.find(c => c.type === 'text')?.text || '';
      const match = /FOUND:\s*([^\s\n]+)/i.exec(text);
      const email = match ? match[1].toLowerCase().replace(/[.,;]$/, '') : null;
      return { email: email && isValidEmail(email) ? email : null, inputTokens, outputTokens };
    }

    if (data.stop_reason === 'tool_use') {
      const results = [];
      for (const block of data.content.filter(c => c.type === 'tool_use')) {
        const content = block.name === 'search_web'
          ? await doWebSearch(block.input.query)
          : block.name === 'fetch_page'
            ? await doFetchPage(block.input.url)
            : 'Unknown tool';
        results.push({ type: 'tool_result', tool_use_id: block.id, content });
      }
      messages.push({ role: 'user', content: results });
    }
  }

  return { email: null, inputTokens, outputTokens };
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const pass = params.pass || 'estimate';
  const limit = parseInt(params.limit || (pass === 'dirs' ? '12' : '4'));
  const offset = parseInt(params.offset || '0');

  const rows = await getRange(TABS.LEADS, 'A2:AA');
  const leads = rows.map((row, i) => ({ lead: rowToLead(row, i + 2), rowNum: i + 2 }));

  // ── Estimate mode ─────────────────────────────────────────────────────────
  if (pass === 'estimate') {
    const dirsCount = leads.filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:not-found').length;
    const claudeCount = leads.filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:dirs-tried').length;
    const totalForClaude = dirsCount + claudeCount; // dirs pass failures feed claude pass
    const estimatedCost = parseFloat((
      (totalForClaude * AVG_INPUT_TOKENS_PER_LEAD / 1_000_000) * PRICE_INPUT_PER_M +
      (totalForClaude * AVG_OUTPUT_TOKENS_PER_LEAD / 1_000_000) * PRICE_OUTPUT_PER_M
    ).toFixed(2));

    const dirsCallsNeeded = Math.ceil(dirsCount / 12);
    const claudeCallsNeeded = Math.ceil(totalForClaude / 4);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        dirsQueueSize: dirsCount,
        claudeQueueSize: claudeCount,
        estimatedClaudeCostUsd: estimatedCost,
        estimatedClaudeCostGbp: parseFloat((estimatedCost * 0.79).toFixed(2)),
        note: `Run dirs pass first (${dirsCallsNeeded} calls needed), then claude pass (~${claudeCallsNeeded} calls). Most dirs failures will also be claude failures — expect ~10-20% find rate on Claude.`,
      }),
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
        if (result) {
          await updateCell(TABS.LEADS, `E${rowNum}`, result.email);
          await updateCell(TABS.LEADS, `I${rowNum}`, '');
          if (result.phone && !lead.phone) await updateCell(TABS.LEADS, `F${rowNum}`, result.phone);
          stats.found++;
          console.log(`[backfill-dirs] ✓ ${lead.businessName}: ${result.email} (${result.source})`);
        } else {
          await updateCell(TABS.LEADS, `I${rowNum}`, 'email:dirs-tried');
          stats.notFound++;
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

  // ── Claude pass ───────────────────────────────────────────────────────────
  if (pass === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { statusCode: 200, body: JSON.stringify({ error: 'No ANTHROPIC_API_KEY configured' }) };
    }

    const targets = leads.filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:dirs-tried');
    const batch = targets.slice(offset, offset + limit);
    const remaining = Math.max(0, targets.length - offset - batch.length);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const stats = { pass: 'claude', found: 0, notFound: 0, errors: 0, total: batch.length, remaining, nextOffset: offset + batch.length };

    for (const { lead, rowNum } of batch) {
      try {
        const result = await runClaudeOnLead(lead);
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        if (result.email) {
          await updateCell(TABS.LEADS, `E${rowNum}`, result.email);
          await updateCell(TABS.LEADS, `I${rowNum}`, '');
          stats.found++;
          console.log(`[backfill-claude] ✓ ${lead.businessName}: ${result.email}`);
        } else {
          await updateCell(TABS.LEADS, `I${rowNum}`, 'email:all-tried');
          stats.notFound++;
        }
      } catch (err) {
        console.error(`[backfill-claude] Error ${lead.businessName}:`, err.message);
        stats.errors++;
      }
    }

    stats.tokens = { input: totalInputTokens, output: totalOutputTokens };
    stats.estimatedCostUsd = parseFloat((
      (totalInputTokens / 1_000_000) * PRICE_INPUT_PER_M +
      (totalOutputTokens / 1_000_000) * PRICE_OUTPUT_PER_M
    ).toFixed(4));

    if (remaining === 0) stats.message = 'Claude pass complete. All leads processed.';
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
