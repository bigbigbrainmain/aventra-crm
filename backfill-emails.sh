#!/bin/bash

BASE_URL="https://aventra-crm.netlify.app/.netlify/functions/backfill-emails"
LIMIT=5
offset=0
total_found=0
total_not_found=0
total_errors=0
batch_num=0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Email backfill — aventra-crm"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for deploy
echo ""
echo "Waiting for Netlify deploy..."
while true; do
  result=$(curl -sf "$BASE_URL?offset=0&limit=1" --max-time 15 2>/dev/null)
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
    echo "  ⚠️  Batch $batch_num failed — retrying in 10s..."
    sleep 10
    continue
  fi

  found=$(echo "$result"     | grep -o '"found":[0-9]*'      | grep -o '[0-9]*')
  not_found=$(echo "$result" | grep -o '"notFound":[0-9]*'   | grep -o '[0-9]*')
  errors=$(echo "$result"    | grep -o '"errors":[0-9]*'     | grep -o '[0-9]*')
  remaining=$(echo "$result" | grep -o '"remaining":[0-9]*'  | grep -o '[0-9]*')
  processed=$(echo "$result" | grep -o '"processed":[0-9]*'  | grep -o '[0-9]*')
  next=$(echo "$result"      | grep -o '"nextOffset":[0-9]*' | grep -o '[0-9]*')

  found=${found:-0}
  not_found=${not_found:-0}
  errors=${errors:-0}
  processed=${processed:-0}
  remaining=${remaining:-0}

  total_found=$((total_found + found))
  total_not_found=$((total_not_found + not_found))
  total_errors=$((total_errors + errors))
  total_processed=$((offset + processed))

  if [ "$found" -gt 0 ]; then
    found_str="✅ $found found"
  else
    found_str="   $found found"
  fi

  echo "  Batch $batch_num  |  leads $((offset+1))–$total_processed  |  $found_str  |  ❌ $not_found not found  |  ⚠️  $errors errors  |  $remaining remaining"

  if [ "$remaining" = "0" ] || [ -z "$remaining" ] || [ "$processed" = "0" ]; then
    break
  fi

  offset=$next
  sleep 2
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total=$((total_found + total_not_found + total_errors))
if [ "$total" -gt 0 ]; then
  pct=$((total_found * 100 / total))
else
  pct=0
fi
echo "  Done — $total leads processed"
echo "  ✅ $total_found emails found  ($pct% hit rate)"
echo "  ❌ $total_not_found not found"
echo "  ⚠️  $total_errors errors"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
