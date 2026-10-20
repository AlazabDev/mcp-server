"""Fail early on an incomplete Git checkout; requires no Frappe or credentials."""
import ast
import json
from pathlib import Path
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
metadata = tomllib.loads((ROOT / "pyproject.toml").read_text())
assert metadata["project"]["name"] == "mcp_server"
assert metadata["tool"]["bench"]["frappe-dependencies"]["frappe"] == ">=16.0.0,<17.0.0"
assert sys.version_info[:2] == (3, 14), "Use Python 3.14 for this Frappe 16 app"
for relative in ("mcp_server/hooks.py", "mcp_server/modules.txt", "mcp_server/assets/seed.json",
                 "mcp_server/public/icon.svg", "az_mcp/daftra/backup-skill/scripts/inspect_backup.py"):
    assert (ROOT / relative).is_file(), f"Missing checkout file: {relative}"
assert (ROOT / "mcp_server/modules.txt").read_text().strip() == "Mcp Server"
for path in (ROOT / "mcp_server").rglob("*.py"):
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
for path in (ROOT / "mcp_server").rglob("*.json"):
    json.loads(path.read_text(encoding="utf-8"))
for path in (ROOT / "mcp_server").rglob("*.js"):
    subprocess.run(["node", "--check", str(path)], check=True)
subprocess.run(["bash", "-n", str(ROOT / "install_frappe16.sh")], check=True)
from mcp_server.backup import execute
assert execute("inventory", {})["live"] is False
print("PASS: checkout metadata, Python/JSON/JS/Bash and attached backup reader")
