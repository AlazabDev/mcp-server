#!/usr/bin/env bash
# Run from the EXTRACTED release directory on the TARGET SERVER.
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=/mnt/mcp/daftra
STAMP="$(date +%Y%m%d-%H%M%S)"
command -v node >/dev/null || { echo 'ERROR: Node.js is not installed'; exit 1; }
command -v pm2 >/dev/null || { echo 'ERROR: PM2 is not installed; install with npm install -g pm2'; exit 1; }
command -v rsync >/dev/null || { echo 'ERROR: rsync is required'; exit 1; }
mkdir -p "$TARGET"
if [[ -f "$TARGET/server.mjs" ]]; then
  mkdir -p "$TARGET/backups/$STAMP"
  cp -a "$TARGET/server.mjs" "$TARGET/package.json" "$TARGET/catalog.json" "$TARGET/backups/$STAMP/" 2>/dev/null || true
  echo "Existing core files backed up in $TARGET/backups/$STAMP"
fi
# Preserve existing .env, backups, logs, unrelated runtime files.
rsync -a --exclude '.env' --exclude 'backups/' --exclude 'logs/' --exclude 'node_modules/' --exclude 'server.env' "$SOURCE_DIR/" "$TARGET/"
if [[ ! -f "$TARGET/.env" ]]; then
  cp "$TARGET/.env.example" "$TARGET/.env"
  chmod 600 "$TARGET/.env"
  echo 'ERROR: .env template created; fill existing real MCP_ACCESS_KEY and DAFTRA_API_KEY, then rerun.'
  exit 2
fi
cd "$TARGET"
node --check server.mjs
npm test
if command -v ss >/dev/null && ss -ltnp | grep -qE '127\.0\.0\.1:8766\b'; then
  if ! pm2 jlist | node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>process.exit(JSON.parse(s).some(x=>x.name==='alazab-daftra-mcp')?0:1))"; then
    echo 'ERROR: port 8766 is in use by a non-PM2 process. Stop old systemd service after confirming ownership.'
    exit 3
  fi
fi
if pm2 describe alazab-daftra-mcp >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
curl -fsS http://127.0.0.1:8766/daftra/api/status >/dev/null
curl -fsS http://127.0.0.1:8766/daftra-docs/api/operations | node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>{let a=JSON.parse(s);if(a.length!==301)process.exit(1);console.log('VERIFIED operations:',a.length)})"
echo 'PM2 deployment verified locally. Merge deploy/nginx-location.conf in existing virtual host and run nginx -t.'
