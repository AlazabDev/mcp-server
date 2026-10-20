import asyncio
from azure.identity import AzureCliCredential
from mcp import ClientSession
import httpx2
from mcp.client.streamable_http import streamable_http_client

URL = (
    "https://az-ai-resource.services.ai.azure.com/api/projects/"
    "az-ai-gateway/toolboxes/daftra-toolbox/versions/1/mcp?api-version=v1"
)

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
                result = await session.list_tools()

                print("MCP TOOLS FOUND:", len(result.tools))
                for tool in result.tools:
                    print(" -", tool.name)

                if not result.tools:
                    raise RuntimeError("No MCP tools exposed")

                print("MCP DISCOVERY: PASS")

asyncio.run(main())
