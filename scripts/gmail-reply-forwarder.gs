/**
 * Aventra CRM — Gmail Reply Forwarder
 *
 * Watches ollie@aventrasites.online for inbound replies to cold outreach emails
 * and POSTs them to the Netlify reply webhook so the CRM registers them.
 *
 * ONE-TIME SETUP (must be run signed in as ollie@aventrasites.online):
 * 1. Go to https://script.google.com → New project
 * 2. Paste this entire file, replacing the default code
 * 3. Click Run → installTrigger (authorise permissions when prompted)
 * 4. Done — the script polls every 5 minutes automatically
 *
 * How it works:
 * - Every 5 minutes it scans the inbox for threads not yet labelled "crm-processed"
 * - If any message in a thread was delivered to ollie+{leadId}@aventrasites.online
 *   it POSTs { to, from } to the reply webhook
 * - The thread is then labelled "crm-processed" so it is never double-fired
 */

const WEBHOOK_URL = 'https://aventra-crm.netlify.app/.netlify/functions/reply-webhook';
const PROCESSED_LABEL = 'crm-processed';

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function handleNewReplies() {
  const label = getOrCreateLabel(PROCESSED_LABEL);
  const threads = GmailApp.search(`in:inbox -label:${PROCESSED_LABEL}`, 0, 50);

  for (const thread of threads) {
    let notified = false;

    for (const msg of thread.getMessages()) {
      if (notified) break;

      // Delivered-To is the most reliable header for the actual delivery address
      // and preserves the plus-address even when the To: header shows a display name
      const deliveredTo = msg.getHeader('Delivered-To') || '';
      const toHeader = msg.getHeader('To') || '';
      const combined = `${deliveredTo} ${toHeader}`;

      const match = combined.match(/ollie\+([^@\s<>+]+)@aventrasites\.online/i);
      if (!match) continue;

      const leadId = match[1];
      const from = msg.getFrom();

      try {
        const resp = UrlFetchApp.fetch(WEBHOOK_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ to: `ollie+${leadId}@aventrasites.online`, from }),
          muteHttpExceptions: true,
        });
        Logger.log(`Reply forwarded: lead ${leadId} from ${from} → HTTP ${resp.getResponseCode()}`);
        notified = true;
      } catch (e) {
        Logger.log(`Webhook error for lead ${leadId}: ${e.message}`);
      }
    }

    thread.addLabel(label);
  }
}

/** Run this once manually to install the 5-minute polling trigger. */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'handleNewReplies')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('handleNewReplies')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('Done — handleNewReplies will fire every 5 minutes.');
}
