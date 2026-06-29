const { TABS, rowToLead, rowToScheduled, getRange, appendRow, ensureTab, genId, isGenericInbox } = require('./_sheets');

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const SCHEDULED_HEADERS = ['ID', 'Lead ID', 'Business Name', 'Subject', 'Body', 'Send At', 'Status', 'Created At', 'Error', 'Lead Email'];
const DEAD_STATUSES = new Set(['Lost', 'Qualified Out', 'Closed Won', 'NRTB', 'Incorrect Product Fit', 'Replied']);

exports.handler = async (event) => {
  try {
    const limit = parseInt(event.queryStringParameters?.limit || '20');

    await ensureTab(TABS.SCHEDULED, SCHEDULED_HEADERS);

    const [leadRows, schedRows] = await Promise.all([
      getRange(TABS.LEADS, 'A2:Z'),
      getRange(TABS.SCHEDULED, 'A2:J'),
    ]);

    const alreadyPending = new Set(
      schedRows.map(r => rowToScheduled(r, 0)).filter(s => s.status === 'pending').map(s => s.leadId)
    );

    // Leads with email + pitch already written, never sent, not dead, not already queued
    const ready = leadRows
      .map((row, i) => rowToLead(row, i + 2))
      .filter(l =>
        l.id && l.email && !isGenericInbox(l.email) && l.subject && l.emailBody &&
        l.outreachCount === 0 &&
        !DEAD_STATUSES.has(l.status) &&
        l.outreachOptedOut !== 'Yes' &&
        !alreadyPending.has(l.id)
      )
      .slice(0, limit);

    if (!ready.length) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ queued: 0, message: 'No leads ready with existing pitches' }) };
    }

    const now = new Date().toISOString();
    // Spread over next 6 hours
    const msSpread = 6 * 60 * 60 * 1000;

    for (const lead of ready) {
      const sendAt = new Date(Date.now() + Math.random() * msSpread).toISOString();
      await appendRow(TABS.SCHEDULED, [
        genId('sched'), lead.id, lead.businessName, lead.subject, lead.emailBody,
        sendAt, 'pending', now, '', lead.email,
      ]);
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ queued: ready.length, leads: ready.map(l => l.businessName) }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
