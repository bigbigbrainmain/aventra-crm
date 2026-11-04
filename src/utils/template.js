// Placeholder handling for Outreach > Bulk send templates.

export const PLACEHOLDERS = [
  { tag: '{firstName}', label: 'First name', hint: 'From Primary Contact. If missing it is dropped, so "Hi {firstName}," becomes "Hi,"' },
  { tag: '{business}',  label: 'Business',   hint: 'Business name' },
  { tag: '{city}',      label: 'City',       hint: 'City' },
  { tag: '{industry}',  label: 'Trade',      hint: 'Industry / trade' },
];

export const DEFAULT_TEMPLATE = {
  name: 'Trades intro',
  sender: 'ollie',
  subject: 'Website for {business}',
  body: `Hi {firstName},

I build unforgettable, clean and affordable websites for businesses in the trades industries.

None of this overcomplicated, expensive and difficult to maintain stuff. Just what you need to win more business and have an online presence.

Interested to hear more? Drop me a reply and I'll share more information.

Thanks,
Ollie`,
};

// First name from the lead's Primary Contact ("dave smith" → "Dave").
// We never guess from the business name — a wrong name is worse than none.
export function firstNameFor(lead) {
  const first = String(lead.primaryContact || '').trim().split(/\s+/)[0] || '';
  if (!first || first.includes('@') || first.length < 2) return '';
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

// Fill a template for one lead. Returns { text, missing } where missing lists
// placeholders that had no value (other than firstName, which degrades
// gracefully).
export function renderTemplate(text, lead) {
  const values = {
    firstName: firstNameFor(lead),
    business: lead.businessName || '',
    city: lead.city || '',
    industry: (lead.industry || '').toLowerCase(),
  };
  const missing = [];
  let out = String(text || '');
  // "Hi {firstName}," → "Hi," when there's no name (eat the leading space)
  if (!values.firstName) out = out.replace(/[ \t]*\{firstName\}/g, '');
  out = out.replace(/\{(business|city|industry|firstName)\}/g, (_, key) => {
    if (!values[key]) missing.push(`{${key}}`);
    return values[key];
  });
  return { text: out, missing };
}

// Any {placeholder} still left (e.g. a typo like {frstName})
export function leftoverPlaceholders(text) {
  return String(text || '').match(/\{[a-zA-Z]+\}/g) || [];
}

// N send times spread evenly (with a little jitter) between 9:00 and 17:00 on
// the given local day. If that day is today, starts from now. Returns ISO
// strings. scheduled-send runs on the hour, so sends land hourly in batches.
export function spreadTimes(count, day) {
  const start = new Date(day); start.setHours(9, 0, 0, 0);
  const end = new Date(day); end.setHours(17, 0, 0, 0);
  const now = Date.now();
  const from = Math.max(start.getTime(), now + 5 * 60 * 1000);
  if (from >= end.getTime() || count === 0) return null;
  const step = (end.getTime() - from) / count;
  return Array.from({ length: count }, (_, i) =>
    new Date(from + step * i + Math.random() * step * 0.8).toISOString()
  );
}

// Next weekday on or after the given date (skips Sat/Sun)
export function nextWeekday(d) {
  const out = new Date(d);
  while (out.getDay() === 0 || out.getDay() === 6) out.setDate(out.getDate() + 1);
  return out;
}

// YYYY-MM-DD in local (UK) time
export function localDateStr(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
