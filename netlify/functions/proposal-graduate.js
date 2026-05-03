const { TABS, rowToLead, getRange, appendRow, updateRow, genId } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GH_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'aventra-crm',
});

async function ghGet(token, path) {
  const res = await fetch(`https://api.github.com/${path}`, { headers: GH_HEADERS(token) });
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}`);
  return res.json();
}

async function ghPut(token, path, body) {
  const res = await fetch(`https://api.github.com/${path}`, {
    method: 'PUT',
    headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PUT ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function ghDelete(token, path, body) {
  const res = await fetch(`https://api.github.com/${path}`, {
    method: 'DELETE',
    headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub DELETE ${path} → ${res.status}: ${text}`);
  }
}

// Recursively copy all files from srcRepo/srcPath into destRepo/destPath
async function copyDir(token, srcRepo, srcPath, destRepo, destPath, commitMessage) {
  const items = await ghGet(token, `repos/${srcRepo}/contents/${srcPath}`);
  for (const item of items) {
    if (item.type === 'file') {
      const file = await ghGet(token, `repos/${srcRepo}/contents/${item.path}`);
      const destFilePath = `${destPath}/${item.name}`;
      // Check if file already exists in dest (need its SHA to update)
      let existingSha;
      try {
        const existing = await ghGet(token, `repos/${destRepo}/contents/${destFilePath}`);
        existingSha = existing.sha;
      } catch {
        // file doesn't exist yet, that's fine
      }
      await ghPut(token, `repos/${destRepo}/contents/${destFilePath}`, {
        message: commitMessage,
        content: file.content.replace(/\n/g, ''),
        ...(existingSha ? { sha: existingSha } : {}),
      });
    } else if (item.type === 'dir') {
      await copyDir(token, srcRepo, item.path, destRepo, `${destPath}/${item.name}`, commitMessage);
    }
  }
}

// Delete all files in srcRepo/srcPath
async function deleteDir(token, repo, path, commitMessage) {
  let items;
  try {
    items = await ghGet(token, `repos/${repo}/contents/${path}`);
  } catch {
    return; // already gone
  }
  for (const item of items) {
    if (item.type === 'file') {
      await ghDelete(token, `repos/${repo}/contents/${item.path}`, {
        message: commitMessage,
        sha: item.sha,
      });
    } else if (item.type === 'dir') {
      await deleteDir(token, repo, item.path, commitMessage);
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const token = process.env.GH_TOKEN;
  if (!token) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'GH_TOKEN not configured' }) };

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { leadId, businessName, domain, monthlyFee, setupFee, goLiveDate, notes, removeFromProposals } = body;
  const folderName = body.folderName;

  if (!leadId || !folderName || !businessName) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing leadId, folderName, or businessName' }) };
  }

  const PROPOSALS = 'bigbigbrainmain/aventra-proposals';
  const LIVE_SITES = 'bigbigbrainmain/aventra-sites';
  const commitMsg = `chore: graduate ${folderName} to live sites`;

  try {
    // 1. Copy folder from proposals → live sites
    await copyDir(token, PROPOSALS, folderName, LIVE_SITES, folderName, commitMsg);

    // 2. Optionally remove from proposals
    if (removeFromProposals) {
      await deleteDir(token, PROPOSALS, folderName, `chore: remove ${folderName} after graduation`);
    }

    // 3. Create customer record in Google Sheet
    const customerId = genId('C');
    const netlifyUrl = `https://aventra-${folderName}.netlify.app`;
    await appendRow(TABS.CUSTOMERS, [
      customerId,
      businessName,
      domain || '',
      netlifyUrl,
      folderName,
      goLiveDate || '',
      monthlyFee || '',
      'Active',
      notes || '',
      setupFee || '',
    ]);

    // 4. Update lead status to "Won" and clear proposal fields
    const rows = await getRange(TABS.LEADS, 'A2:R');
    for (let i = 0; i < rows.length; i++) {
      const lead = rowToLead(rows[i], i + 2);
      if (lead.id === leadId) {
        const updatedRow = [
          lead.id, lead.businessName, lead.industry, lead.city, lead.email,
          lead.phone, lead.website, lead.priority, lead.priorityReason,
          'Won', lead.datePitched, lead.notes, lead.subject, lead.emailBody,
          lead.calendlyLinkSent, lead.isFavourite ? 'TRUE' : 'FALSE',
          lead.proposalUrl, lead.proposalFolder,
        ];
        await updateRow(TABS.LEADS, i + 2, updatedRow);
        break;
      }
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, customerId, netlifyUrl }) };
  } catch (err) {
    console.error('proposal-graduate error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
