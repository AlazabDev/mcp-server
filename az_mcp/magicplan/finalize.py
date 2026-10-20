import os, json, asyncio, subprocess
from pathlib import Path

import requests
import httpx2
from azure.identity import AzureCliCredential
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

ROOT = Path(__file__).resolve().parent
ENV = ROOT.parent / ".env"
OUT = ROOT / "foundry_ready"
OUT.mkdir(exist_ok=True)

for line in ENV.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

PROJECT = os.environ["FOUNDRY_PROJECT_ENDPOINT"].rstrip("/")
APIM = "https://az-ai-gateway.azure-api.net"
KEY = os.environ["AZURE_APIM_SUBSCRIPTION_KEY"]
NAME = "magicplan-toolbox"
CONN = "magicplan-apim-connection"
SUB = subprocess.check_output(
    ["az", "account", "show", "--query", "id", "-o", "tsv"],
    text=True
).strip()
CONN_ID = (
    f"/subscriptions/{SUB}/resourceGroups/azab-rg-ai"
    "/providers/Microsoft.CognitiveServices"
    "/accounts/az-ai-resource/projects/az-ai-gateway"
    f"/connections/{CONN}"
)
credential = AzureCliCredential()
token = credential.get_token("https://ai.azure.com/.default").token
headers = {"Authorization": f"Bearer {token}"}

# Verify the working APIM route before changing Foundry
r = requests.get(
    f"{APIM}/magicplan/projects",
    headers={"Ocp-Apim-Subscription-Key": KEY},
    params={"page": 1, "page_size": 10},
    timeout=60
)
r.raise_for_status()
assert r.json().get("page_info", {}).get("total_count") == 18
print("APIM BACKEND: PASS", flush=True)

# Create APIM connection, but preserve an existing one
cmd = [
    "azd", "ai", "connection", "create", CONN,
    "--kind", "remote-tool",
    "--target", APIM,
    "--auth-type", "custom-keys",
    "--custom-key", f"Ocp-Apim-Subscription-Key={KEY}"
]
proc = subprocess.run(cmd, capture_output=True, text=True)
if proc.returncode:
    message = proc.stdout + proc.stderr
    if "already exists" not in message.lower():
        raise RuntimeError("Connection creation failed: " + message[:1200])
    print("CONNECTION: EXISTS", flush=True)
else:
    print("CONNECTION: CREATED", flush=True)

# Read the existing v2 configuration directly from Foundry
url = f"{PROJECT}/toolboxes/{NAME}/versions/2?api-version=v1"
r = requests.get(url, headers=headers, timeout=60)
r.raise_for_status()
current = r.json()

tools = current.get("tools", [])
assert len(tools) == 1, f"Expected one OpenAPI tool; got {len(tools)}"

tool = tools[0]
assert tool.get("type") == "openapi"
spec = tool["openapi"]["spec"]

methods = {"get", "post", "put", "patch", "delete"}
ops = [
    (method, path)
    for path, item in spec["paths"].items()
    for method in item
    if method.lower() in methods
]
assert len(ops) == 6, f"Expected six operations, got {len(ops)}"
assert all(method.lower() == "get" for method, _ in ops)

# Route all six operations through APIM
spec["servers"] = [{"url": f"{APIM}/magicplan"}]
spec.setdefault("components", {})["securitySchemes"] = {
    "ApimSubscriptionKey": {
        "type": "apiKey",
        "in": "header",
        "name": "Ocp-Apim-Subscription-Key"
    }
}
spec["security"] = [{"ApimSubscriptionKey": []}]

for item in spec["paths"].values():
    for method, operation in item.items():
        if method.lower() in methods:
            operation.pop("security", None)

tool["openapi"]["auth"] = {
    "type": "project_connection",
    "security_scheme": {
        "project_connection_id": CONN_ID
    }
}

payload = {
    "description": "Alazab Magicplan verified read-only APIs via APIM",
    "tools": tools
}

(OUT / "magicplan-apim.json").write_text(
    json.dumps(payload, ensure_ascii=False, indent=2)
)

r = requests.post(
    f"{PROJECT}/toolboxes/{NAME}/versions?api-version=v1",
    headers={**headers, "Content-Type": "application/json"},
    json=payload,
    timeout=120
)
if not r.ok:
    raise RuntimeError(f"CREATE HTTP {r.status_code}: {r.text[:1500]}")

result = r.json()
version = str(result.get("version") or result.get("name") or "")
assert version.isdigit(), result
print("CANDIDATE VERSION:", version, flush=True)

# Test the candidate before publishing
async def smoke():
    endpoint = (
        f"{PROJECT}/toolboxes/{NAME}/versions/{version}"
        "/mcp?api-version=v1"
    )
    async with httpx2.AsyncClient(
        headers=headers,
        timeout=httpx2.Timeout(180.0, connect=30.0)
    ) as client:
        async with streamable_http_client(
            endpoint, http_client=client
        ) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                listed = (await session.list_tools()).tools
                assert len(listed) == 6, f"Found {len(listed)} tools"

                matches = [
                    x for x in listed if "get_projects" in x.name
                ]
                assert len(matches) == 1, [x.name for x in listed]
                selected = matches[0]

                args = {}
                properties = selected.input_schema.get("properties", {})
                for name, value in [("page", 1), ("page_size", 10)]:
                    if name in properties:
                        typ = properties[name].get("type")
                        args[name] = str(value) if typ == "string" else value

                response = await session.call_tool(selected.name, args)
                assert not response.is_error, "MCP returned an error"

                body = json.dumps(
                    response.model_dump(mode="json"),
                    ensure_ascii=False
                )

                # Verify real content, not only an HTTP success
                assert '"18"' in body or '"total_count":18' in body \
                    or '"total_count": 18' in body, (
                    "MCP returned data but total_count=18 was not confirmed: "
                    + body[:800]
                )

                print("MCP TOOLS:", len(listed), flush=True)
                print("MAGICPLAN MCP END-TO-END: PASS", flush=True)

try:
    asyncio.run(smoke())
except BaseException as error:
    def explain(e):
        if isinstance(e, BaseExceptionGroup):
            for child in e.exceptions:
                explain(child)
        else:
            print("MCP ERROR:", type(e).__name__, str(e)[:1800])
    explain(error)
    raise SystemExit("NOT PUBLISHED")

subprocess.run(
    ["azd", "ai", "toolbox", "publish", NAME, version, "--no-prompt"],
    check=True
)
print("MAGICPLAN TOOLBOX PUBLISHED:", version)
