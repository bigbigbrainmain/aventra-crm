const { TABS, getRange, appendRows, genId } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PLACES_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

async function findBusinesses(type, city) {
  const key = process.env.GOOGLE_API_KEY;
  const params = new URLSearchParams({ query: `${type} in ${city}`, key, region: 'uk' });
  const res = await fetch(`${PLACES_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${data.status} — ${data.error_message || ''}`);
  }
  return data.results || [];
}

async function getPlaceDetails(placeId) {
  const key = process.env.GOOGLE_API_KEY;
  const params = new URLSearchParams({ place_id: placeId, fields: 'website,formatted_phone_number', key });
  try {
    const res = await fetch(`${DETAILS_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const r = data.result || {};
    return { website: r.website || '', phone: r.formatted_phone_number || '' };
  } catch {
    return { website: '', phone: '' };
  }
}

async function getExistingNames() {
  const rows = await getRange(TABS.LEADS, 'B2:B');
  return new Set(rows.map(r => (r[0] || '').trim().toLowerCase()).filter(Boolean));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!process.env.GOOGLE_API_KEY) {
    return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'GOOGLE_API_KEY is not configured yet' }) };
  }

  try {
    const { industry, city } = JSON.parse(event.body || '{}');
    if (!industry || !city) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'industry and city are required' }) };
    }

    const [places, existingNames] = await Promise.all([
      findBusinesses(industry, city),
      getExistingNames(),
    ]);

    // Fetch details in parallel (up to 20 — first page)
    const detailResults = await Promise.all(
      places.slice(0, 20).map(async (place) => {
        const details = place.place_id ? await getPlaceDetails(place.place_id) : { website: '', phone: '' };
        return { name: place.name || '', ...details };
      })
    );

    const rowsToAdd = [];
    const addedNames = [];

    for (const lead of detailResults) {
      const key = lead.name.trim().toLowerCase();
      if (!key || existingNames.has(key)) continue;
      existingNames.add(key);
      addedNames.push(lead.name);
      rowsToAdd.push([
        genId('G'), lead.name, industry, city,
        '', lead.phone, lead.website,
        '', '', 'New', '', '', '', '', 'No',
        'FALSE', '', '', '', 0, '', '', '', '',
      ]);
    }

    if (rowsToAdd.length) await appendRows(TABS.LEADS, rowsToAdd);

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ added: addedNames.length, total: places.length, names: addedNames }),
    };
  } catch (err) {
    console.error('lead-gen-find error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
