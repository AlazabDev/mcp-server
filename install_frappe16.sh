#!/usr/bin/env bash
set -euo pipefail
BENCH_PATH="${1:-/home/frappe/frappe-bench}"
SITE_NAME="${2:-erp.alazab.com}"
SOURCE_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$BENCH_PATH"
[[ -x env/bin/python && -f sites/apps.txt && -d "sites/$SITE_NAME" ]] || { echo 'مسار Bench أو الموقع غير صحيح'; exit 1; }
env/bin/python -c 'import frappe,sys; assert frappe.__version__.split(".")[0]=="16", "Frappe 16 required"; assert sys.version_info >= (3,14), "Use the Python version required by your Frappe 16 release"'
# Make the requested upgrade reviewable and preserve existing site data and source configuration.
bench --site "$SITE_NAME" backup --with-files
if [[ -d apps/mcp_server && "$(realpath apps/mcp_server)" != "$SOURCE_PATH" ]]; then
  BACKUP_PATH="$BENCH_PATH/private-app-backups/mcp_server-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$(dirname "$BACKUP_PATH")"
  cp -a apps/mcp_server "$BACKUP_PATH"
fi
SOURCE_PATH="$SOURCE_PATH" env/bin/python - <<'PY'
import os,shutil
from pathlib import Path
source=Path(os.environ['SOURCE_PATH']).resolve();dest=Path('apps/mcp_server').resolve()
if source!=dest:
    # Keep existing credentials, repositories and runtime data in the installed checkout.
    for item in source.iterdir():
        if item.name in ('.git','.venv','env','state','__pycache__'):continue
        if item.name=='az_mcp' and (dest/item.name).exists():
            for p in item.rglob('*'):
                rel=p.relative_to(item);target=dest/item.name/rel
                if any(x in ('.git','__pycache__','node_modules') for x in rel.parts):continue
                if p.is_dir():target.mkdir(parents=True,exist_ok=True)
                elif not target.exists():target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
        elif item.is_dir():shutil.copytree(item,dest/item.name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','.git'))
        else:dest.mkdir(parents=True,exist_ok=True);shutil.copy2(item,dest/item.name)
PY
env/bin/pip install -e apps/mcp_server
# Register the local Frappe app without requiring a fabricated remote Git repository.
env/bin/python - <<'PY'
from pathlib import Path
p=Path('sites/apps.txt');apps=p.read_text().splitlines()
if 'mcp_server' not in apps:
    p.write_text('\n'.join([*apps,'mcp_server'])+'\n')
PY
if SITE_NAME="$SITE_NAME" env/bin/python - <<'PYAPP'
import os,sys
import frappe
frappe.init(os.environ['SITE_NAME'],sites_path='sites')
frappe.connect()
try:installed='mcp_server' in frappe.get_installed_apps()
finally:frappe.destroy()
sys.exit(0 if installed else 1)
PYAPP
then
  bench --site "$SITE_NAME" migrate
else
  bench --site "$SITE_NAME" install-app mcp_server
fi
bench build --app mcp_server
bench --site "$SITE_NAME" clear-cache
printf 'تم تجهيز التطبيق. أعد تشغيل خدمات Bench بالطريقة المعتمدة لديك، ثم افتح /app/mcp-center\n'
