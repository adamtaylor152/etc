#!/usr/bin/env bash
# Production smoke test: read-only checks that the pages and APIs clients and the crew depend on are working.
# Run after every deploy (ship script) and every 10 minutes by .github/workflows/monitor.yml. Never writes data.
# Usage: scripts/smoke.sh [crm_url] [site_url]
set -uo pipefail
APP=${1:-https://app.etccrew.ca}
SITE=${2:-https://etccrew.ca}
fails=0
check() { # name, url, expected status, text the body must contain
  local body code
  body=$(curl -sS -m 20 -w '\n%{http_code}' "$2" 2>&1) || true
  code=${body##*$'\n'}; body=${body%$'\n'*}
  if [ "$code" = "$3" ] && grep -q -- "$4" <<<"$body"; then echo "ok   $1"
  else echo "FAIL $1 (HTTP $code, wanted $3 containing '$4')"; fails=$((fails + 1)); fi
}
check "health"               "$APP/api/healthz"            200 '"up":true'
check "email + texts"        "$APP/api/healthz"            200 '"ok":true'
check "booking page (CRM)"   "$APP/book"                   200 'Book etc.'
check "booking times API"    "$APP/api/public/slots"       200 '"windows"'
check "sign-in page"         "$APP/login"                  200 'etc.'
check "client links"         "$APP/p/not-a-real-token"     200 'expired'
check "runner needs sign-in" "$APP/api/run"                401 'Sign in'
check "website home"         "$SITE/"                      200 'etc.'
check "website booking"      "$SITE/book.html"             200 'slot-field'
[ "$fails" = 0 ] && echo "all good" || { echo "$fails check(s) failed"; exit 1; }
