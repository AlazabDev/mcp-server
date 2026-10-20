# Daftra → Foundry: evidence-gated builder

Copy `build.py` to `/mnt/f/apps/mcp/toolboxes/daftra/mcp/build_foundry.py` on WSL.

Run:
```bash
cd /mnt/f/apps/mcp/toolboxes/daftra/mcp
python3 build_foundry.py
```

Requires existing `.env`, `daftra_openapi.json`, `evidence/collections_full/report.json`, `evidence/products_full/report.json` and live `evidence/details/`.

Outputs `foundry_ready/daftra-*-verified.openapi.json` and `foundry_ready/manifest.json`.

Only GET list/detail endpoints with saved successful evidence are included. All original operation definitions are left untouched. No network requests, no production mutation, no automatic Foundry import. The `apikey` is configured as an OpenAPI API-key scheme; create the corresponding Foundry connection separately.

Important: `200` response bodies are purposefully broad objects until a per-operation contract is derived from persisted live `response.json`. This package is an initial usable read-only toolbox set, not a claim that all 301 source operations were validated.
