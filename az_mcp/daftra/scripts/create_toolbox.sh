#!/usr/bin/env bash
set -euo pipefail
: "${FOUNDRY_PROJECT_ENDPOINT:?Set verified Foundry project endpoint}"
: "${AGENT_TOKEN:?Set Azure access token for Foundry}"
root_dir="$(cd -- "$(dirname -- "$0")/.." && pwd)"
test -f "$root_dir/toolbox.request.json" || { echo 'Run scripts/configure.py first'; exit 1; }
curl --fail-with-body --silent --show-error \
 -X POST "${FOUNDRY_PROJECT_ENDPOINT%/}/toolboxes/alazab-daftra/versions?api-version=v1" \
 -H "Authorization: Bearer $AGENT_TOKEN" \
 -H 'Content-Type: application/json' \
 --data-binary "@$root_dir/toolbox.request.json" \
 -o "$root_dir/toolbox.create.response.json"
cat "$root_dir/toolbox.create.response.json"
