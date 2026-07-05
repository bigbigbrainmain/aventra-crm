const { getSettings, setSetting, settingInt, SETTING_KEYS } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
};

// Env vars mirror the fallbacks used by auto-lead-gen / auto-followup so the
// values returned here are exactly what the scheduled functions will use.
const DEFAULT_OUTREACH = parseInt(process.env.OUTREACH_DAILY_TARGET || process.env.OUTREACH_PER_RUN || '20');
const DEFAULT_FOLLOWUP = parseInt(process.env.FOLLOWUP_DAILY_TARGET || process.env.FOLLOWUP_PER_RUN || '20');

// Sanity ceiling — a fat-fingered 2000 would torch the domain's reputation.
const MAX_TARGET = 200;

function parseTarget(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_TARGET) {
    throw new Error(`${label} must be a whole number between 0 and ${MAX_TARGET}`);
  }
  return n;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  try {
    if (event.httpMethod === 'GET') {
      const settings = await getSettings();
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          outreachDailyTarget: settingInt(settings, SETTING_KEYS.OUTREACH_DAILY_TARGET, DEFAULT_OUTREACH),
          followupDailyTarget: settingInt(settings, SETTING_KEYS.FOLLOWUP_DAILY_TARGET, DEFAULT_FOLLOWUP),
        }),
      };
    }

    if (event.httpMethod === 'PATCH') {
      const data = JSON.parse(event.body || '{}');
      const updates = [];
      if (data.outreachDailyTarget !== undefined) {
        updates.push([SETTING_KEYS.OUTREACH_DAILY_TARGET, parseTarget(data.outreachDailyTarget, 'Outreach daily target')]);
      }
      if (data.followupDailyTarget !== undefined) {
        updates.push([SETTING_KEYS.FOLLOWUP_DAILY_TARGET, parseTarget(data.followupDailyTarget, 'Follow-up daily target')]);
      }
      if (updates.length === 0) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Nothing to update' }) };
      }
      for (const [key, value] of updates) {
        await setSetting(key, value);
      }
      const settings = await getSettings();
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          outreachDailyTarget: settingInt(settings, SETTING_KEYS.OUTREACH_DAILY_TARGET, DEFAULT_OUTREACH),
          followupDailyTarget: settingInt(settings, SETTING_KEYS.FOLLOWUP_DAILY_TARGET, DEFAULT_FOLLOWUP),
        }),
      };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('settings error:', err);
    const isBadInput = err.message && err.message.includes('must be a whole number');
    return { statusCode: isBadInput ? 400 : 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
