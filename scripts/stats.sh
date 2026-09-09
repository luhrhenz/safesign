#!/usr/bin/env bash
# Print current usage totals. Reads STATS_TOKEN from .env.local.
#
#   ./scripts/stats.sh                 # against localhost
#   ./scripts/stats.sh https://…       # against a deployment
set -euo pipefail

BASE="${1:-http://localhost:3000}"
TOKEN="$(grep -s '^STATS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"')"

if [ -z "$TOKEN" ]; then
  echo "No STATS_TOKEN in .env.local. Add one, and set the same value where the app is deployed." >&2
  exit 1
fi

curl -sS -H "Authorization: Bearer $TOKEN" "$BASE/api/stats" | python3 -m json.tool
