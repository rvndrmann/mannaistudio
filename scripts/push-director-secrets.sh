#!/usr/bin/env bash
# Copies the secrets the Director turn needs from .env.local into the Supabase
# Edge Function environment.
#
# Run by you, not by a tool: these are provider credentials, and the fewer
# places they pass through the better. Review the printed names before
# confirming — values are never printed.
#
#   bash scripts/push-director-secrets.sh
set -euo pipefail

ENV_FILE="${1:-.env.local}"
[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE here."; exit 1; }

# SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by
# the platform and cannot be set — the NEXT_PUBLIC_ copies are what this
# project's own code reads, so those do need to travel.
NEEDED=(
  OPENAI_API_KEY
  OPENAI_DIRECTOR_MODEL
  GEMINI_API_KEY
  GOOGLE_API_KEY
  GOOGLE_AI_STUDIO_API_KEY
  GOOGLE_KMS_SERVICE_ACCOUNT_JSON
  GOOGLE_KMS_PROJECT_ID
  GOOGLE_KMS_LOCATION
  GOOGLE_KMS_KEY_RING
  GOOGLE_KMS_KEY_NAME
  FAL_API_KEY
  FAL_KEY
  BYTEPLUS_ARK_API_KEY
  BYTEPLUS_ARK_BASE_URL
  ARK_API_KEY
  ARK_ACCESS_KEY
  ARK_SECRET_KEY
  ARK_ASSET_GROUP_ID
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
)

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

FOUND=()
MISSING=()
for name in "${NEEDED[@]}"; do
  if line=$(grep -m1 "^${name}=" "$ENV_FILE"); then
    printf '%s\n' "$line" >> "$TMP"
    FOUND+=("$name")
  else
    MISSING+=("$name")
  fi
done

echo "Will set ${#FOUND[@]} secrets:"
printf '  %s\n' "${FOUND[@]}"
if [ ${#MISSING[@]} -gt 0 ]; then
  echo
  echo "Not in $ENV_FILE (skipped — fine if you do not use them):"
  printf '  %s\n' "${MISSING[@]}"
fi

echo
read -r -p "Push these to Supabase Edge Functions? [y/N] " reply
[ "$reply" = "y" ] || { echo "Nothing sent."; exit 0; }

npx supabase secrets set --env-file "$TMP"
echo "Done. Verify with: npx supabase secrets list"
