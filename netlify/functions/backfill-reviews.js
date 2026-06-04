const { TABS, rowToLead, getRange, updateCell } = require('./_sheets');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

async function fetchReviews(businessName, city, apiKey) {
  const query = city ? `${businessName} ${city}` : businessName;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    return {
      reviewCount: place.userRatingCount || 0,
      avgRating: place.rating || 0,
    };
  } catch {
    return null;
  }
}

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

    console.log(`[backfill-reviews] batch ${offset}–${offset + batch.length} of ${all.length}`);

    const results = { found: 0, notFound: 0, errors: 0 };

    for (const { lead, rowNum } of batch) {
      try {
        const data = await fetchReviews(lead.businessName, lead.city, apiKey);
        if (data && data.reviewCount > 0) {
          await updateCell(TABS.LEADS, `Y${rowNum}`, data.reviewCount);
          await updateCell(TABS.LEADS, `Z${rowNum}`, data.avgRating);
          results.found++;
          console.log(`[backfill-reviews] ✓ ${lead.businessName}: ${data.reviewCount} reviews, ${data.avgRating}★`);
        } else {
          results.notFound++;
          console.log(`[backfill-reviews] ✗ ${lead.businessName}: no data`);
        }
      } catch (err) {
        results.errors++;
        console.error(`[backfill-reviews] Error for ${lead.businessName}:`, err.message);
      }
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ processed: batch.length, remaining, nextOffset: offset + batch.length, ...results }),
    };
  } catch (err) {
    console.error('[backfill-reviews] Fatal:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
