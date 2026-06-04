const { TABS, rowToLead, getRange, updateCell } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'GOOGLE_API_KEY not set' }) };

    const offset = parseInt(event.queryStringParameters?.offset || '0');
    const limit = parseInt(event.queryStringParameters?.limit || '5');

    const rows = await getRange(TABS.LEADS, 'A2:Z');
    const all = rows
      .map((row, i) => ({ lead: rowToLead(row, i + 2), rowNum: i + 2 }))
      .filter(({ lead }) => lead.id && lead.businessName && !lead.reviewCount);

    const batch = all.slice(offset, offset + limit);
    const remaining = Math.max(0, all.length - offset - batch.length);

    let found = 0, notFound = 0, errors = 0;
    let lastError = null;

    for (const { lead, rowNum } of batch) {
      const query = [lead.businessName, lead.city].filter(Boolean).join(' ');
      let data = null;

      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.rating,places.userRatingCount',
          },
          body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
        });
        if (res.ok) {
          const json = await res.json();
          const place = json.places && json.places[0];
          if (place && place.userRatingCount) {
            data = { reviewCount: place.userRatingCount, avgRating: place.rating || 0 };
          }
        } else {
          const errText = await res.text();
          lastError = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
        }
      } catch (fetchErr) {
        lastError = `fetch error: ${fetchErr.message}`;
      }

      try {
        if (data) {
          await updateCell(TABS.LEADS, `Y${rowNum}`, data.reviewCount);
          await updateCell(TABS.LEADS, `Z${rowNum}`, data.avgRating);
          found++;
        } else {
          notFound++;
        }
      } catch (writeErr) {
        errors++;
        lastError = `write error: ${writeErr.message}`;
      }
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ processed: batch.length, remaining, nextOffset: offset + batch.length, found, notFound, errors, lastError }),
    };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
