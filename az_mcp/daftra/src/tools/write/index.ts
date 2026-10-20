import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../../client.js";
import { registerInvoiceWriteTools } from "./invoices.js";
import { registerClientWriteTools } from "./clients.js";
import { registerProductWriteTools } from "./products.js";
import { registerSafetyInfoTool } from "./safety-info.js";

/**
 * يسجّل كل أدوات الكتابة (فقط عندما ENABLE_WRITE_TOOLS=true).
 * إن كانت معطّلة، يسجّل فقط أداة الاستعلام عن الحالة.
 */
export function registerWriteTools(
  server: McpServer,
  client: DaftraClient
): void {
  const enableWrite = process.env.ENABLE_WRITE_TOOLS === "true";

  // أداة الحالة مسجّلة دائماً (لتُظهر للوكيل أن الكتابة معطّلة)
  registerSafetyInfoTool(server);

  if (!enableWrite) {
    console.error("🔒 أدوات الكتابة معطّلة (ENABLE_WRITE_TOOLS != true)");
    return;
  }

  registerInvoiceWriteTools(server, client);
  registerClientWriteTools(server, client);
  registerProductWriteTools(server, client);

  console.error("✍️ أدوات الكتابة مُسجَّلة (15 أداة إضافية)");
}