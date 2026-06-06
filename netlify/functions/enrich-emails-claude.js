const { TABS, rowToLead, getRange, updateCell } = require('./_sheets');

// Haiku 4.5 pricing per million tokens (used for cost estimates)
const PRICE_INPUT_PER_M = 0.80;
const PRICE_OUTPUT_PER_M = 4.00;

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

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function doWebSearch(query) {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=en-GB&count=5`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return `Search returned ${res.status}`;
    const text = stripHtml(await res.text());
    return text.substring(0, 3000) || 'No results';
  } catch {
    return 'Search timed out';
  }
}

async function doFetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return `Page returned ${res.status}`;
    const text = stripHtml(await res.text());
    return text.substring(0, 4000);
  } catch {
    return 'Page fetch timed out';
  }
}

const TOOLS = [
  {
    name: 'search_web',
    description: 'Search the web. Returns page text including snippets from search results.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'fetch_page',
    description: 'Fetch and read the text content of a web page.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
];

const SYSTEM = `You find email addresses for UK small businesses.

Given a business name, city, and optional website, search for their real contact email.

Good sources: their website contact/about pages, yell.com, checkatrade.com, rated.people.com, trustatrader.com, google maps listing pages.

When you find a valid email address, reply with exactly:
FOUND: email@domain.com

If you cannot find one after searching, reply with exactly:
NOT_FOUND

Rules:
- Max 5 tool calls total — be efficient
- Skip noreply@, webmaster@, postmaster@, and platform emails (e.g. @wix.com, @squarespace.com)
- Real business emails only (e.g. john@smithplumbing.co.uk, info@acmecleaning.com)`;

async function findEmailWithClaude(lead) {
  const userMsg = `Find the contact email for: "${lead.businessName}" in ${lead.city}, UK.${lead.website ? ` Website: ${lead.website}` : ''} Industry: ${lead.industry}.`;

  const messages = [{ role: 'user', content: userMsg }];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let turn = 0; turn < 4; turn++) {
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

    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = await res.json();

    totalInputTokens += data.usage?.input_tokens || 0;
    totalOutputTokens += data.usage?.output_tokens || 0;

    messages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason === 'end_turn') {
      const text = data.content.find(c => c.type === 'text')?.text || '';
      const match = /FOUND:\s*([^\s\n]+)/i.exec(text);
      const email = match ? match[1].toLowerCase().replace(/[.,;]$/, '') : null;
      return { email: email && isValidEmail(email) ? email : null, totalInputTokens, totalOutputTokens };
    }

    if (data.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of data.content.filter(c => c.type === 'tool_use')) {
        let result;
        if (block.name === 'search_web') result = await doWebSearch(block.input.query);
        else if (block.name === 'fetch_page') result = await doFetchPage(block.input.url);
        else result = 'Unknown tool';
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
    }
  }

  return { email: null, totalInputTokens, totalOutputTokens };
}

exports.handler = async (event) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 200, body: JSON.stringify({ error: 'No ANTHROPIC_API_KEY' }) };
  }

  const params = event.queryStringParameters || {};
  const limit = parseInt(params.limit || '1');
  const offset = parseInt(params.offset || '0');

  const rows = await getRange(TABS.LEADS, 'A2:AA');
  const targets = rows
    .map((row, i) => ({ lead: rowToLead(row, i + 2), rowNum: i + 2 }))
    .filter(({ lead }) => lead.id && !lead.email && lead.priorityReason === 'email:dirs-tried');

  const batch = targets.slice(offset, offset + limit);
  const remaining = Math.max(0, targets.length - offset - batch.length);

  console.log(`[enrich-claude] Processing ${batch.length}/${targets.length} (offset=${offset}, ${remaining} remaining)`);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const stats = { found: 0, notFound: 0, errors: 0, total: batch.length, remaining, nextOffset: offset + batch.length };

  for (const { lead, rowNum } of batch) {
    try {
      const result = await findEmailWithClaude(lead);
      totalInputTokens += result.totalInputTokens;
      totalOutputTokens += result.totalOutputTokens;

      if (result.email) {
        await updateCell(TABS.LEADS, `E${rowNum}`, result.email);
        await updateCell(TABS.LEADS, `I${rowNum}`, '');
        stats.found++;
        console.log(`[enrich-claude] ✓ ${lead.businessName}: ${result.email}`);
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

  const estimatedCostUsd = parseFloat((
    (totalInputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (totalOutputTokens / 1_000_000) * PRICE_OUTPUT_PER_M
  ).toFixed(4));

  stats.tokens = { input: totalInputTokens, output: totalOutputTokens };
  stats.estimatedCostUsd = estimatedCostUsd;

  console.log(`[enrich-claude] Done: ${stats.found} found, ${stats.notFound} not found, ~$${estimatedCostUsd} (${totalInputTokens}in/${totalOutputTokens}out tokens)`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(stats),
  };
};
