// Shared helpers for manual template sends (Outreach > Bulk send).
// Used by send-template.js (send now / queue) and scheduled-send.js (delivers
// queued template rows).
//
// Unlike the AI outreach path, NOTHING is appended to a template email except
// the sender's signature block and an unsubscribe link — no Calendly CTA, no
// Joe sign-off. The template itself is the whole message.

const { leadIdTag } = require('./_sheets');

const APP_URL = (process.env.APP_URL || 'https://aventra-crm.netlify.app').replace(/\/+$/, ''); // env value has a trailing slash
const DOMAIN = 'aventrasites.online';

const SENDERS = {
  joe: {
    id: 'joe',
    name: 'Joe Clacher',
    email: `joe@${DOMAIN}`,
    phone: process.env.SENDER_JOE_PHONE || '07710 988 228',
  },
  ollie: {
    id: 'ollie',
    name: 'Ollie Eastham',
    email: `ollie@${DOMAIN}`,
    phone: process.env.SENDER_OLLIE_PHONE || '',
  },
};

// Max template emails per sender per UK calendar day (sent + still queued).
const DAILY_CAP = parseInt(process.env.TEMPLATE_DAILY_CAP || '30');

// Reply detection runs as an Apps Script inside ollie@'s mailbox and only
// recognises ollie+{leadId}@ addresses — so every template email (whoever
// sends it) carries that address as reply-to. Joe's own address is added too
// so his replies still land with him.
const REPLY_TRACKING_LOCAL = 'ollie';

function replyToFor(sender, leadId) {
  const tracking = `${REPLY_TRACKING_LOCAL}+${leadId}@${DOMAIN}`;
  return sender.id === REPLY_TRACKING_LOCAL ? [tracking] : [tracking, sender.email];
}

// Any {placeholder} left in the text means the template wasn't filled in.
function leftoverPlaceholders(text) {
  return String(text || '').match(/\{[a-zA-Z]+\}/g) || [];
}

// Template emails go out as PLAIN TEXT ONLY. With no HTML part, Resend has
// nothing to inject its open-tracking pixel into or rewrite links in (it did
// both, routing even the unsubscribe link via as.aventrasites.online), and the
// email reads like one a person typed. That lands in the inbox more often.
// Trade-off: opens aren't tracked for these emails. Replies and bounces still are.
function buildTemplateEmail({ body, sender, leadId }) {
  const unsubUrl = `${APP_URL}/.netlify/functions/outreach-unsubscribe?id=${leadId}`;
  const sigLines = [sender.name, 'Aventra', sender.phone, DOMAIN].filter(Boolean);
  const text = `${body}\n\n--\n${sigLines.join('\n')}\n\nNot for you? Unsubscribe here: ${unsubUrl}`;
  return { text, unsubUrl };
}

async function sendTemplateEmail({ to, subject, body, sender, leadId, idempotencyKey }) {
  const { text, unsubUrl } = buildTemplateEmail({ body, sender, leadId });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // Resend dedupes identical keys for 24h, guarding against double-clicks
      // and overlapping scheduled-send runs.
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: `${sender.name} <${sender.email}>`,
      to: [to],
      reply_to: replyToFor(sender, leadId),
      subject,
      text, // no html on purpose, see buildTemplateEmail
      headers: {
        // Gmail shows its own one-click "Unsubscribe" button from these
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      // Lets resend-webhook record bounces/complaints against the lead
      tags: [{ name: 'leadId', value: leadIdTag(leadId) }],
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
}

// UK calendar date (YYYY-MM-DD) for an ISO timestamp — functions run in UTC.
function ukDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

// Template emails used per sender per UK day: { 'ollie|2026-11-04': 12, ... }
function usageByDay(scheduledItems) {
  const usage = {};
  for (const s of scheduledItems) {
    if (s.type !== 'template' || !s.sendAt) continue;
    if (s.status !== 'sent' && s.status !== 'pending') continue;
    const key = `${s.sender}|${ukDate(s.sendAt)}`;
    usage[key] = (usage[key] || 0) + 1;
  }
  return usage;
}

module.exports = {
  SENDERS,
  DAILY_CAP,
  buildTemplateEmail,
  sendTemplateEmail,
  leftoverPlaceholders,
  ukDate,
  usageByDay,
};
