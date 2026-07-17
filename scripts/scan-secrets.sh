#!/usr/bin/env bash
#
# Fails when a tracked file contains real provider key material.
#
# A Polygon key has already reached this repository's Git history once, so docs
# stay in scope: the check filters documented placeholders rather than skipping
# the files that placeholders live in. VITE_-prefixed values are public by
# design and .env.example holds empty placeholders, so both are out of scope.
#
# Usage: bash scripts/scan-secrets.sh

set -euo pipefail

cd "$(dirname "$0")/.."

fail=0

# Obvious documentation placeholders, not credentials.
PLACEHOLDER='(:PASSWORD@|:YOUR_[A-Z_]*@|\$\{|<[A-Za-z_][A-Za-z0-9_ -]*>|\*\*\*|xxxxx|REPLACE_ME|CHANGE_ME)'

report() {
  local label="$1"
  local matches="$2"
  if [ -n "$matches" ]; then
    echo "::error::${label}"
    printf '%s\n' "$matches"
    fail=1
  fi
}

# Live key material with provider-specific prefixes, plus credentialed DB URLs.
KEY_PATTERN='sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|postgres(ql)?://[^[:space:]"'"'"']+:[^[:space:]"'"'"']+@'
key_hits="$(git grep -nIE "$KEY_PATTERN" -- . ':!*.example' ':!scripts/scan-secrets.sh' || true)"
key_hits="$(printf '%s' "$key_hits" | grep -vE "$PLACEHOLDER" || true)"
report 'Possible credential committed to the repository.' "$key_hits"

# Non-empty assignments to known secret variables.
ASSIGN_PATTERN='(POLYGON_API_KEY|CLERK_SECRET_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|TT_PASSWORD|TT_REMEMBER_TOKEN|WEB_PUSH_VAPID_PRIVATE_KEY|ADMIN_API_TOKEN|HEARTBEAT_TOKEN)[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9_-]{8,}'
assign_hits="$(git grep -nIE "$ASSIGN_PATTERN" -- . ':!*.example' ':!*.md' ':!scripts/scan-secrets.sh' ':!**/test/**' ':!**/tests/**' || true)"
assign_hits="$(printf '%s' "$assign_hits" | grep -vE "$PLACEHOLDER" || true)"
report 'Non-empty secret assignment committed to the repository.' "$assign_hits"

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "scan-secrets OK: no committed provider credentials found."
