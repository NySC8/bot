#!/usr/bin/env bash
set -euo pipefail
: "${BOT_TOKEN:?set BOT_TOKEN first}"
: "${WORKER_URL:?set WORKER_URL first}"
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${WORKER_URL%/}/telegram\",\"allowed_updates\":[\"message\"]}"
echo
