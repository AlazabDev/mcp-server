#!/usr/bin/env bash
set -euo pipefail
: "${MCP_ACCESS_KEY:?MCP_ACCESS_KEY required}"
URL="${1:-https://mcp.alazab.com/daftra}"
request(){ curl -fsS --max-time 30 -H "x-mcp-key: ${MCP_ACCESS_KEY}" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' --data "$1" "$URL"; echo; }
echo '1 initialize'; request '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"alazab-smoke","version":"1.0"}}}'
echo '2 tools/list'; request '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
echo '3 invoice operation description'; request '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"daftra_describe_operation","arguments":{"operation_id":"get_invoices_id"}}}'
echo '4 invoice 334 (real Daftra read)'; request '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"daftra_call","arguments":{"operation_id":"get_invoices_id","path_params":{"id":334}}}}'
