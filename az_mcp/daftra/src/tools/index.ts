import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../client.js";
import { registerInvoiceTools } from "./invoices.js";
import { registerClientTools } from "./clients.js";
import { registerProductTools } from "./products.js";
import { registerPaymentTools } from "./payments.js";
import { registerReportTools } from "./reports.js";
import { registerInventoryTools } from "./inventory.js";
import { registerWriteTools } from "./write/index.js";   // 👈 جديد

export function registerAllTools(server: McpServer, client: DaftraClient): void {
  // قراءة (Read)
  registerInvoiceTools(server, client);
  registerClientTools(server, client);
  registerProductTools(server, client);
  registerPaymentTools(server, client);
  registerReportTools(server, client);
  registerInventoryTools(server, client);

  // كتابة (Write) — تُسجَّل حسب الحالة
  registerWriteTools(server, client);
}