import json
import os
import ssl
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone

root = Path(__file__).resolve().parent

for line in (root / ".env").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    value = value.strip().strip('"').strip("'")
    os.environ.setdefault(key.strip(), value)

base = os.getenv("DAFTRA_BASE_URL", "").rstrip("/")
if not base:
    subdomain = os.getenv("DAFTRA_SUBDOMAIN", "")
    if not subdomain:
        raise SystemExit("Missing DAFTRA_BASE_URL / DAFTRA_SUBDOMAIN")
    base = f"https://{subdomain}.daftara.com/api2"

if not base.endswith("/api2"):
    base += "/api2"

api_key = os.getenv("DAFTRA_API_KEY", "")
token = os.getenv("DAFTRA_ACCESS_TOKEN", "")
mode = os.getenv("DAFTRA_AUTH_MODE", "").lower()

headers = {"Accept": "application/json"}
if mode == "bearer" and token:
    headers["Authorization"] = f"Bearer {token}"
elif api_key:
    headers["apikey"] = api_key
elif token:
    headers["Authorization"] = f"Bearer {token}"
else:
    raise SystemExit("Missing Daftra credentials")

resources = {
    "clients": 48,
    "invoices": 332,
    "estimates": 331,
    "products": 267,
    "work_orders": 19,
    "suppliers": 13,
    "client_payments": 272,
    "invoice_payments": 287,
    "expenses": 1,
    "journal_accounts": 381,
    "staff": 3
}

out = root / "evidence" / "details"
out.mkdir(parents=True, exist_ok=True)

report = []

for resource, record_id in resources.items():
    url = f"{base}/{resource}/{record_id}.json"
    req = urllib.request.Request(url, headers=headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            raw = response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read()
    except Exception as error:
        status = 0
        raw = json.dumps({"transport_error": str(error)}).encode()

    try:
        body = json.loads(raw.decode("utf-8"))
    except Exception:
        body = {"raw_response": raw.decode("utf-8", errors="replace")}

    folder = out / resource
    folder.mkdir(parents=True, exist_ok=True)

    (folder / "response.json").write_text(
        json.dumps(body, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    metadata = {
        "resource": resource,
        "method": "GET",
        "record_id": record_id,
        "url": url,
        "http_status": status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    (folder / "metadata.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8"
    )

    report.append({
        "resource": resource,
        "record_id": record_id,
        "status": status,
        "result": body.get("result") if isinstance(body, dict) else None,
        "message": body.get("message") if isinstance(body, dict) else None
    })

    print(status, resource, record_id)

(out / "report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print("REPORT:", out / "report.json")
