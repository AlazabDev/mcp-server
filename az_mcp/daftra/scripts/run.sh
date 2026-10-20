#!/usr/bin/env bash
set -euo pipefail
cd /mnt/mcp/daftra
if [[ -f .env ]]; then set -a; source .env; set +a; fi
exec node server.mjs
