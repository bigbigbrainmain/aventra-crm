const { TABS, rowToLead, getRange, updateCell } = require('./_sheets');

// Sonnet 4.6 pricing per million tokens
const PRICE_INPUT_PER_M = 3.00;
const PRICE_OUTPUT_PER_M = 15.00;

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

// Anthropic server-side tools — no client-side execution needed
const TOOLS = [
  { type: 'web_search_20260209', name: 'web_search' },
  { type: 'web_fetch_20260209', name: 'web_fetch' },
];

const SYSTEM = `You find email addresses for UK small businesses.

Given a business name, city, and optional website, search for their real contact email.

Good sources: their website contact/about pages, yell.com, checkatrade.com, ratedpeople.com, trustatrader.com, google maps listing pages.

When you find a valid email address, reply with exactly:
FOUND: email@domain.com

If you cannot find one after searching, reply with exactly:
NOT_FOUND

Rules:
- Skip noreply@, webmaster@, postmaster@, and platform emails (e.g. @wix.com, @squarespace.com)
- Real business emails only (e.g. john@smithplumbing.co.uk, info@acmecleaning.com)`;

async function findEmailWithClaude(lead) {
  const userMsg = `Find the contact email for: "${lead.businessName}" in ${lead.city}, UK.${lead.website ? ` Website: ${lead.website}` : ''} Industry: ${lead.industry}.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM,
      tools: TOOLS,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const totalInputTokens = data.usage?.input_tokens || 0;
  const totalOutputTokens = data.usage?.output_tokens || 0;

  const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  const match = /FOUND:\s*([^\s\n]+)/i.exec(text);
  const email = match ? match[1].toLowerCase().replace(/[.,;]$/, '') : null;

  return { email: email && isValidEmail(email) ? email : null, totalInputTokens, totalOutputTokens };
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
