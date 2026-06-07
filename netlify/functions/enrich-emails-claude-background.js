const { TABS, rowToLead, getRange, updateCell } = require('./_sheets');

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

const SYSTEM = `You find email addresses for UK small businesses.

Given a business name, city, and optional website, search for their real contact email.

Good sources: their website contact/about pages, yell.com, checkatrade.com, ratedpeople.com, trustatrader.com, google maps listing pages.

When you find a valid email address, reply with exactly:
FOUND: email@domain.com

If you cannot find one after searching, reply with exactly:
NOT_FOUND

Rules:
- Skip noreply@, webmaster@, postmaster@ and platform emails (@wix.com, @squarespace.com)
- Real business emails only`;

async function runClaudeOnLead(lead) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM,
      tools: [
        { type: 'web_search_20260209', name: 'web_search' },
        { type: 'web_fetch_20260209', name: 'web_fetch' },
      ],
      messages: [{
        role: 'user',
        content: `Find the contact email for: "${lead.businessName}" in ${lead.city}, UK.${lead.website ? ` Website: ${lead.website}` : ''} Industry: ${lead.industry}.`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  const match = /FOUND:\s*([^\s\n]+)/i.exec(text);
  const email = match ? match[1].toLowerCase().replace(/[.,;]$/, '') : null;

  return {
    email: email && isValidEmail(email) ? email : null,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

exports.handler = async (event) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[enrich-claude-bg] No ANTHROPIC_API_KEY configured');
    return { statusCode: 200, body: JSON.stringify({ error: 'No ANTHROPIC_API_KEY' }) };
  }

  const params = event.queryStringParameters || {};
  const limit = parseInt(params.limit || '10');
  const offset = parseInt(params.offset || '0');

  const rows = await getRange(TABS.LEADS, 'A2:AB');
  const targets = rows
    .map((row, i) => ({ lead: rowToLead(row, i + 2), rowNum: i + 2 }))
    .filter(({ lead }) => lead.id && !lead.email && !lead.emailEnriched);

  const batch = targets.slice(offset, offset + limit);
  const remaining = Math.max(0, targets.length - offset - batch.length);

  console.log(`[enrich-claude-bg] ${batch.length} leads to process (${remaining} remaining after this batch)`);

  if (batch.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ found: 0, notFound: 0, errors: 0, total: 0, remaining: 0 }),
    };
  }

  const stats = { found: 0, notFound: 0, errors: 0, total: batch.length, remaining };

  for (const { lead, rowNum } of batch) {
    try {
      const result = await runClaudeOnLead(lead);
      if (result.email) {
        await updateCell(TABS.LEADS, `E${rowNum}`, result.email);
        await updateCell(TABS.LEADS, `I${rowNum}`, '');
        stats.found++;
        console.log(`[enrich-claude-bg] ✓ ${lead.businessName}: ${result.email}`);
      } else {
        stats.notFound++;
        console.log(`[enrich-claude-bg] ✗ ${lead.businessName}: not found`);
      }
    } catch (err) {
      console.error(`[enrich-claude-bg] Error for ${lead.businessName}:`, err.message);
      stats.errors++;
    }
    // Always mark enriched so this lead is never retried
    await updateCell(TABS.LEADS, `AB${rowNum}`, 'TRUE').catch(() => {});
  }

  console.log(`[enrich-claude-bg] Done: ${stats.found} found, ${stats.notFound} not found, ${stats.errors} errors`);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(stats),
  };
};
