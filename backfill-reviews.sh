#!/bin/bash

BASE_URL="https://aventra-crm.netlify.app/.netlify/functions/backfill-reviews"
LIMIT=5
offset=0
total_found=0
total_not_found=0
total_errors=0
batch_num=0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Reviews backfill — aventra-crm"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Waiting for Netlify deploy..."
while true; do
  result=$(curl -sf "$BASE_URL?offset=0&limit=1" --max-time 20 2>/dev/null)
  if echo "$result" | grep -q "processed"; then break; fi
  printf "."
  sleep 10
done
echo " ready!"
echo ""

while true; do
  batch_num=$((batch_num + 1))
  result=$(curl -sf "$BASE_URL?offset=$offset&limit=$LIMIT" --max-time 60 2>/dev/null)

  if [ -z "$result" ]; then
    echo "  ⚠️  Batch $batch_num timed out — retrying in 10s..."
    sleep 10
    continue
  fi

  found=$(echo "$result"     | grep -o '"found":[0-9]*'      | grep -o '[0-9]*')
  not_found=$(echo "$result" | grep -o '"notFound":[0-9]*'   | grep -o '[0-9]*')
  errors=$(echo "$result"    | grep -o '"errors":[0-9]*'     | grep -o '[0-9]*')
  remaining=$(echo "$result" | grep -o '"remaining":[0-9]*'  | grep -o '[0-9]*')
  processed=$(echo "$result" | grep -o '"processed":[0-9]*'  | grep -o '[0-9]*')
  next=$(echo "$result"      | grep -o '"nextOffset":[0-9]*' | grep -o '[0-9]*')

  found=${found:-0}; not_found=${not_found:-0}; errors=${errors:-0}
  processed=${processed:-0}; remaining=${remaining:-0}

  total_found=$((total_found + found))
  total_not_found=$((total_not_found + not_found))
  total_errors=$((total_errors + errors))
  total_processed=$((offset + processed))

  [ "$found" -gt 0 ] && found_str="✅ $found with reviews" || found_str="   $found with reviews"

  echo "  Batch $batch_num  |  leads $((offset+1))–$total_processed  |  $found_str  |  ❌ $not_found no data  |  $remaining remaining"

  if [ "$remaining" = "0" ] || [ -z "$remaining" ] || [ "$processed" = "0" ]; then
    break
  fi

  offset=$next
  sleep 2
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total=$((total_found + total_not_found + total_errors))
[ "$total" -gt 0 ] && pct=$((total_found * 100 / total)) || pct=0
echo "  Done — $total leads processed"
echo "  ✅ $total_found had Google reviews"
echo "  ❌ $total_not_found no reviews found  ($pct% hit rate)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
