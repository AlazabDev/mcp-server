import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyInfo } from "./safety.js";

export function registerSafetyInfoTool(server: McpServer): void {
  server.tool(
    "daftra_write_status",
    "🔍 استعلام عن حالة أدوات الكتابة (مفعّلة/معطّلة، Dry-Run، حد المعدّل).",
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: `🔐 حالة أمان أدوات الكتابة:\n\n${JSON.stringify(
            safetyInfo(),
            null,
            2
          )}`,
        },
      ],
    })
  );
}