#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DaftraClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";

async function main() {
  const baseUrl = process.env.DAFTRA_BASE_URL;
  const apiKey = process.env.DAFTRA_API_KEY;
  const accessToken = process.env.DAFTRA_ACCESS_TOKEN;

  if (!baseUrl) {
    throw new Error("DAFTRA_BASE_URL is required in .env");
  }
  if (!apiKey && !accessToken) {
    throw new Error("Either DAFTRA_API_KEY or DAFTRA_ACCESS_TOKEN is required");
  }

  const client = new DaftraClient({ baseUrl, apiKey, accessToken });

  const server = new McpServer({
    name: "daftra-mcp",
    version: "1.0.0",
  });

  registerAllTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("✅ Daftra MCP Server is running");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});