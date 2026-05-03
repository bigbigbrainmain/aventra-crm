const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const res = await fetch('https://api.github.com/repos/bigbigbrainmain/aventra-proposals/contents/', {
      headers: {
        ...(process.env.GH_TOKEN ? { 'Authorization': `Bearer ${process.env.GH_TOKEN}` } : {}),
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'aventra-crm',
      },
    });

    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const contents = await res.json();
    const folders = contents
      .filter(item => item.type === 'dir' && !item.name.startsWith('.'))
      .map(item => item.name)
      .sort();

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(folders) };
  } catch (err) {
    console.error('proposal-folders error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
