import os
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

root = Path(__file__).resolve().parent

for line in (root / ".env").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    os.environ.setdefault(
        key.strip(),
        value.strip().strip('"').strip("'")
    )

base = os.getenv("DAFTRA_BASE_URL", "").rstrip("/")
if not base:
    subdomain = os.getenv("DAFTRA_SUBDOMAIN", "")
    if not subdomain:
        raise SystemExit("Missing Daftra URL")
    base = f"https://{subdomain}.daftara.com/api2"

if not base.endswith("/api2"):
    base += "/api2"

headers = {"Accept": "application/json"}
mode = os.getenv("DAFTRA_AUTH_MODE", "").lower()
token = os.getenv("DAFTRA_ACCESS_TOKEN", "")
key = os.getenv("DAFTRA_API_KEY", "")

if mode == "bearer" and token:
    headers["Authorization"] = f"Bearer {token}"
elif key:
    headers["apikey"] = key
elif token:
    headers["Authorization"] = f"Bearer {token}"
else:
    raise SystemExit("Missing authentication")

out = root / "evidence" / "products_full"
pages = out / "pages"
pages.mkdir(parents=True, exist_ok=True)

products = {}
page = 1
limit = 100
complete = False
errors = []

# Resume from saved pages
for saved in sorted(pages.glob("page-*.json")):
    saved_body = json.loads(saved.read_text(encoding="utf-8"))
    for record in saved_body.get("data", []):
        product = record.get("Product", {})
        product_id = product.get("id")
        if product_id is not None:
            products[str(product_id)] = record

    page = max(page, int(saved.stem.split("-")[-1]) + 1)

print(f"RESUME PAGE={page} SAVED_PRODUCTS={len(products)}")

while page <= 1000:
    query = urllib.parse.urlencode({
        "page": page,
        "limit": limit
    })
    url = f"{base}/products.json?{query}"

    for attempt in range(1, 6):
        try:
            req = urllib.request.Request(
                url, headers=headers, method="GET"
            )
            with urllib.request.urlopen(req, timeout=120) as response:
                status = response.status
                body = json.load(response)
            break
        except (TimeoutError, urllib.error.URLError) as error:
            if attempt == 5:
                errors.append({"page": page, "error": str(error)})
                print("FAILED PAGE:", page, error)
                break
            delay = min(5 * 2 ** (attempt - 1), 60)
            print(f"RETRY PAGE={page} ATTEMPT={attempt} WAIT={delay}s")
            time.sleep(delay)
        except Exception as error:
            errors.append({"page": page, "error": str(error)})
            print("FAILED PAGE:", page, error)
            break

    if errors:
        break

    if status != 200 or body.get("result") != "successful":
        errors.append({"page": page, "body": body})
        print("API ERROR:", page)
        break

    records = body.get("data")
    if not isinstance(records, list):
        errors.append({"page": page, "error": "data is not a list"})
        break

    (pages / f"page-{page:04}.json").write_text(
        json.dumps(body, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    before = len(products)

    for record in records:
        product = record.get("Product", {})
        product_id = product.get("id")
        if product_id is not None:
            products[str(product_id)] = record

    print(
        f"PAGE={page} "
        f"RECEIVED={len(records)} "
        f"NEW={len(products)-before} "
        f"TOTAL_UNIQUE={len(products)}"
    )

    if not records or len(records) < limit:
        complete = True
        break

    if len(products) == before:
        errors.append({
            "page": page,
            "error": "No new product IDs; pagination may not advance"
        })
        break

    page += 1
    time.sleep(0.15)

(out / "response.json").write_text(
    json.dumps(list(products.values()), ensure_ascii=False, indent=2),
    encoding="utf-8"
)

(out / "identifiers.json").write_text(
    json.dumps(list(products.keys()), indent=2),
    encoding="utf-8"
)

report = {
    "unique_products": len(products),
    "pages_fetched": len(list(pages.glob("page-*.json"))),
    "complete": complete,
    "errors": errors
}

(out / "report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print("\n===== FINAL REPORT =====")
print(json.dumps(report, ensure_ascii=False, indent=2))
