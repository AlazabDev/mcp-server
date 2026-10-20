# Alazab Daftra MCP 4.0 — Direct Server / PM2

## Endpoints
- `https://mcp.alazab.com/daftra` HTML dashboard and all registered module statuses
- `https://mcp.alazab.com/daftra-docs` searchable API reference with all catalog operations, parameters and bodies
- `https://mcp.alazab.com/daftra/mcp` MCP Streamable HTTP JSON-RPC (requires `x-mcp-key`)
- `/daftra/api/status` public runtime/registry status (not proof of connectivity to Daftra)
- `/daftra-docs/api/operations` public OpenAPI-derived operation metadata

## Requirements
Node 20+, PM2 installed, existing Nginx + HTTPS config for `mcp.alazab.com`. No npm production dependencies.

## Install (manual, preserving existing config)
```bash
sudo mkdir -p /mnt/mcp/daftra
# Copy extracted project contents to /mnt/mcp/daftra. Do not overwrite existing .env
cd /mnt/mcp/daftra
cp -n .env.example .env
# Edit .env, or preserve existing .env; keys MCP_ACCESS_KEY, DAFTRA_API_KEY are required
npm test
pm2 start ecosystem.config.cjs
pm2 save
```

Nginx: Merge the two `location` blocks from `deploy/nginx-location.conf` into the EXISTING server for mcp.alazab.com, without editing unrelated locations. Run `sudo nginx -t && sudo systemctl reload nginx`. Remove any pre-existing conflicting `/daftra` location blocks after inspecting them; do not duplicate locations. Stop the old systemd `alazab-daftra-mcp` service only after successful PM2 health tests, avoiding port collision.

## Health test
```bash
curl -f http://127.0.0.1:8766/daftra/api/status
curl -f http://127.0.0.1:8766/daftra-docs/api/operations | jq length
curl -I https://mcp.alazab.com/daftra
```
For MCP send JSON-RPC `initialize` and `tools/list` to `/daftra/mcp` using `x-mcp-key` and `Accept: application/json, text/event-stream`. `/daftra` is intentionally HTML, not MCP.

## Important
- Module states on dashboard describe registry registration, **not actual connection health to Daftra API**.
- OpenAPI-derived module manifests are generated metadata; runtime operations are executed via a single generic client.
- By default write operations are disabled; set `ENABLE_WRITE_TOOLS=true` explicitly for remote data mutations.
- Preserve `catalog.json` and `modules/`. Keys must not be committed in ZIP or Git.
