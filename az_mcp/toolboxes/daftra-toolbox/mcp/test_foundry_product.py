import asyncio
import json
from pathlib import Path

import httpx2
from azure.identity import AzureCliCredential
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

URL = (
    "https://az-ai-resource.services.ai.azure.com/api/projects/"
    "az-ai-gateway/toolboxes/daftra-toolbox/versions/3/mcp?api-version=v1"
)
TOOL = "daftra-inventory___get_products_by_id"

async def main():
    token = AzureCliCredential().get_token(
        "https://ai.azure.com/.default"
    ).token

    async with httpx2.AsyncClient(
        headers={"Authorization": f"Bearer {token}"},
        timeout=httpx2.Timeout(300.0, connect=30.0)
    ) as client:
        async with streamable_http_client(
            URL, http_client=client
        ) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = (await session.list_tools()).tools
                tool = next(t for t in tools if t.name == TOOL)
                schema = tool.input_schema

                print("INPUT SCHEMA:")
                print(json.dumps(schema, indent=2))

                properties = schema.get("properties", {})
                required = schema.get("required", [])

                args = {}
                for name in properties:
                    if name == "id":
                        args[name] = "267"
                    elif name == "format":
                        args[name] = ".json"

                missing = [x for x in required if x not in args]
                if missing:
                    raise RuntimeError(f"Missing required arguments: {missing}")

                print("CALLING:", TOOL, args)
                result = await session.call_tool(TOOL, args)

                payload = {
                    "is_error": result.is_error,
                    "structured_content": result.structured_content,
                    "content": [
                        c.model_dump(mode="json")
                        for c in result.content
                    ]
                }

                out = Path("evidence/foundry")
                out.mkdir(parents=True, exist_ok=True)
                target = out / "product-267.json"
                target.write_text(
                    json.dumps(payload, ensure_ascii=False, indent=2),
                    encoding="utf-8"
                )

                print("RESULT ERROR:", result.is_error)
                print("SAVED:", target)

                if result.is_error:
                    print(json.dumps(payload, ensure_ascii=False)[:2000])
                    raise RuntimeError("Foundry tool call failed")

                print("FOUNDRY TOOL EXECUTION: PASS")

asyncio.run(main())
