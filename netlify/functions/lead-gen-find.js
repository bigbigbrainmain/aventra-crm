const { TABS, getRange, appendRow, genId } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { industry, city } = JSON.parse(event.body || '{}');
    if (!industry || !city) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'industry and city are required' }) };

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'GOOGLE_API_KEY not configured', noKey: true }) };

    const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({ textQuery: `${industry} in ${city}`, maxResultCount: 20 }),
    });

    if (!placesRes.ok) {
      const errText = await placesRes.text();
      console.error('Places API error:', placesRes.status, errText);
      return { statusCode: 502, headers: HEADERS, body: JSON.stringify({ error: 'Google Places API error: ' + placesRes.status }) };
    }

    const placesData = await placesRes.json();
    const places = placesData.places || [];

    const existingRows = await getRange(TABS.LEADS, 'A2:B');
    const existingNames = new Set(existingRows.map(r => String(r[1] || '').toLowerCase().trim()));

    const addedLeads = [];

    for (const place of places) {
      const name = place.displayName?.text || '';
      if (!name || existingNames.has(name.toLowerCase().trim())) continue;

      const id = genId('L');
      const website = place.websiteUri || '';
      const phone = place.nationalPhoneNumber || '';
      const reviewCount = place.userRatingCount || 0;
      const avgRating = place.rating || 0;

      await appendRow(TABS.LEADS, [
        id, name, industry, city, '', phone, website,
        '', '', 'New', '', '', '', '', 'No', 'FALSE',
        '', '', '', '', '', 0, '', '', '',
        reviewCount, avgRating,
      ]);

      addedLeads.push({ id, businessName: name, industry, city, phone, website, email: '', status: 'New', priority: '', reviewCount, avgRating });
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ leads: addedLeads, count: addedLeads.length }) };
  } catch (err) {
    console.error('lead-gen-find error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
