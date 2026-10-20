import os, json, time, pathlib, urllib.request
from collections import Counter

API = "https://cloud.magicplan.app/api/v2"
PID = os.environ["PROJECT_ID"]
KEY = os.environ["MAGICPLAN_KEY"]
CUSTOMER = os.environ["MAGICPLAN_CUSTOMER"]
USER = "alazab.contract@gmail.com"

OUT = pathlib.Path("magicplan-downloads/Arabesque")
OUT.mkdir(parents=True, exist_ok=True)

headers = {
    "key": KEY,
    "customer": CUSTOMER,
    "Accept": "application/json",
}

def fetch(url, headers=None):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)

# 1. Fetch all pages
files = []
page = 1
expected = None

while True:
    from urllib.parse import urlencode
    query = urlencode({"acting_user": USER, "page": page})
    url = f"{API}/projects/{PID}/files?{query}"
    result = json.loads(fetch(url, headers))

    info = result["page_info"]
    files.extend(result["data"])
    expected = info["total_count"]

    print(f"PAGE={page} FILES={len(files)}/{expected}", flush=True)

    if not info.get("next_page"):
        break
    page = info["next_page"]

# 2. Verify inventory
ids = [f["id"] for f in files]
if len(ids) != len(set(ids)):
    raise RuntimeError("Duplicate file IDs detected")

if len(files) != expected:
    raise RuntimeError(f"Incomplete inventory: {len(files)}/{expected}")

(OUT / "manifest.json").write_text(
    json.dumps(files, indent=2, ensure_ascii=False),
    encoding="utf-8"
)

# 3. Download files
names = Counter(f["filename"] for f in files)
done = skipped = failed = 0
errors = []

for i, f in enumerate(files, 1):
    name = pathlib.Path(f["filename"].replace("\\", "/")).name
    if not name or name in (".", ".."):
        name = f["id"]

    path = pathlib.Path(name)

    if names[f["filename"]] > 1:
        name = f"{path.stem}__{f['id']}{path.suffix}"

    target = OUT / name
    expected_size = f.get("filesize")

    if target.exists() and expected_size is not None:
        if target.stat().st_size == int(expected_size):
            skipped += 1
            continue

    try:
        data = fetch(f["url"])
        if expected_size is not None and len(data) != int(expected_size):
            raise ValueError("File size mismatch")

        temp = target.with_name(target.name + ".part")
        temp.write_bytes(data)
        temp.replace(target)
        done += 1

    except Exception as e:
        failed += 1
        errors.append({"id": f["id"], "filename": name, "error": str(e)})

    if i % 25 == 0 or i == len(files):
        print(
            f"PROGRESS={i}/{len(files)} "
            f"DOWNLOADED={done} SKIPPED={skipped} FAILED={failed}",
            flush=True
        )

(OUT / "errors.json").write_text(
    json.dumps(errors, indent=2, ensure_ascii=False),
    encoding="utf-8"
)

print("\n===== FINAL REPORT =====")
print(json.dumps({
    "total_files": len(files),
    "downloaded": done,
    "skipped": skipped,
    "failed": failed,
    "complete": failed == 0 and done + skipped == len(files),
    "folder": str(OUT.resolve())
}, indent=2))
