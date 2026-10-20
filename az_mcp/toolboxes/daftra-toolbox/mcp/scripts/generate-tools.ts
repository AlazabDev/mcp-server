#!/usr/bin/env tsx
/**
 * 🔧 MCP Tools Generator
 * ----------------------
 * يقرأ extracted/operations-by-module.json
 * ويولّد ملفات TypeScript جاهزة لكل وحدة
 * بالإضافة إلى أداة عامة تعمل مع أي endpoint.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  inputFile: path.resolve(__dirname, "..", "extracted", "operations-by-module.json"),
  outputDir: path.resolve(__dirname, "..", "src", "generated"),
};

interface Operation {
  id: string;
  path: string;
  method: string;
  summary: string;
  description: string;
  tags: string[];
  module: string;
  crudType: string;
  operationId?: string;
  deprecated: boolean;
  parameters: any[];
  requestBody?: any;
  requiresAuth: boolean;
  parameterCount: number;
  hasBody: boolean;
}

/**
 * تحويل اسم وحدة إلى اسم ملف صالح
 */
function toFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

/**
 * تحويل اسم وحدة إلى اسم دالة صالح
 */
function toFunctionName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}

/**
 * توليد اسم أداة MCP
 */
function toToolName(op: Operation): string {
  const module = toFunctionName(op.module);
  const cleanPath = op.path
    .replace(/^\//, "")
    .replace(/\{([^}]+)\}/g, "by_$1")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
  return `${module}_${op.method.toLowerCase()}_${cleanPath}`.substring(0, 60);
}

/**
 * توليد كود TypeScript لأداة واحدة
 */
function generateToolCode(op: Operation): string {
  const toolName = toToolName(op);
  const description = (op.summary || op.description || `${op.method} ${op.path}`)
    .replace(/"/g, '\\"')
    .substring(0, 200);

  // استخراج معاملات الـ path
  const pathParams = (op.parameters || [])
    .filter((p: any) => p.in === "path")
    .map((p: any) => `      ${p.name}: z.string().describe("${(p.description || p.name).replace(/"/g, '\\"')}"),`);

  // استخراج معاملات الـ query الأساسية (أول 10 فقط للاختصار)
  const queryParams = (op.parameters || [])
    .filter((p: any) => p.in === "query")
    .slice(0, 15)
    .map((p: any) => {
      const type = p.schema?.type === "integer" ? "number" :
                   p.schema?.type === "array" ? "z.array(z.any())" :
                   p.schema?.type === "boolean" ? "boolean" : "string";
      const typeStr = type === "string" ? "z.string()" : type === "number" ? "z.number()" : type === "boolean" ? "z.boolean()" : type;
      const optional = p.required ? "" : ".optional()";
      const desc = (p.description || p.name).replace(/"/g, '\\"').substring(0, 100);
      return `      ${p.name}: ${typeStr}${optional}.describe("${desc}"),`;
    });

  const allParams = [...pathParams, ...queryParams].join("\n");
  const hasBody = op.hasBody;

  // توليد path مع استبدال المتغيرات
  const pathExpr = op.path.replace(/\{([^}]+)\}/g, "${params.$1}");

  // استخراج معاملات path في الـ params
  const pathParamNames = (op.parameters || [])
    .filter((p: any) => p.in === "path")
    .map((p: any) => p.name);

  const pathSubstitutions = pathParamNames.map((n) => `      ${n},`).join("\n");

  return `
  server.tool(
    "${toolName}",
    "${description}",
    {
${allParams || "      // لا توجد معاملات"}
    },
    async (params) => {
      const path = \`${pathExpr}\`;
      const response = await client.${op.method.toLowerCase()}(path${hasBody ? ", params.body" : ""}${op.method.toLowerCase() === "get" ? ", params" : ""});
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );`.trim();
}

/**
 * توليد ملف وحدة كامل
 */
function generateModuleFile(module: string, operations: Operation[]): string {
  const fnName = `register${module.replace(/[^a-zA-Z0-9]/g, "").replace(/^./, (c) => c.toUpperCase())}Tools`;
  const toolsCode = operations
    .filter((op) => !op.deprecated)
    .map((op) => {
      try {
        return generateToolCode(op);
      } catch (e) {
        return `  // ⚠️ تعذّر توليد: ${op.id}`;
      }
    })
    .join("\n\n");

  return `// ═══════════════════════════════════════════════════════════════
// 🧩 Module: ${module}  (${operations.length} عمليات)
// تم التوليد تلقائياً بواسطة scripts/generate-tools.ts
// ═══════════════════════════════════════════════════════════════

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../client.js";

export function ${fnName}(server: McpServer, client: DaftraClient) {
${toolsCode}
}
`;
}

/**
 * توليد ملف index لكل الوحدات
 */
function generateIndexFile(modules: string[]): string {
  const imports = modules
    .map((m) => {
      const fn = `register${m.replace(/[^a-zA-Z0-9]/g, "").replace(/^./, (c) => c.toUpperCase())}Tools`;
      const file = toFileName(m);
      return `import { ${fn} } from "./${file}.js";`;
    })
    .join("\n");

  const calls = modules
    .map((m) => {
      const fn = `register${m.replace(/[^a-zA-Z0-9]/g, "").replace(/^./, (c) => c.toUpperCase())}Tools`;
      return `  ${fn}(server, client);`;
    })
    .join("\n");

  return `// ═══════════════════════════════════════════════════════════════
// 🎯 Auto-generated tools index
// ═══════════════════════════════════════════════════════════════

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../client.js";
${imports}

export function registerAllGeneratedTools(server: McpServer, client: DaftraClient) {
${calls}
}
`;
}

async function main() {
  console.log("\n" + "═".repeat(70));
  console.log("🔧  MCP Tools Generator");
  console.log("═".repeat(70) + "\n");

  if (!fs.existsSync(CONFIG.inputFile)) {
    console.error(`❌ لم يُعثر على: ${CONFIG.inputFile}`);
    console.error("   شغّل أولاً: tsx scripts/extract-operations.ts");
    process.exit(1);
  }

  const byModule: Record<string, Operation[]> = JSON.parse(
    fs.readFileSync(CONFIG.inputFile, "utf-8")
  );

  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  console.log("📦 الوحدات المكتشفة:");
  const moduleNames: string[] = [];

  for (const [module, ops] of Object.entries(byModule)) {
    const fileName = toFileName(module);
    const filePath = path.join(CONFIG.outputDir, `${fileName}.ts`);
    const code = generateModuleFile(module, ops);

    fs.writeFileSync(filePath, code, "utf-8");
    moduleNames.push(module);
    console.log(`   ✔ ${fileName}.ts  (${ops.length} عملية)`);
  }

  // توليد ملف index
  const indexPath = path.join(CONFIG.outputDir, "index.ts");
  fs.writeFileSync(indexPath, generateIndexFile(moduleNames), "utf-8");
  console.log(`\n   ✔ index.ts  (يستدعي ${moduleNames.length} وحدة)`);

  console.log("\n" + "═".repeat(70));
  console.log(`✅ تم توليد ${moduleNames.length} ملف في: ${path.relative(process.cwd(), CONFIG.outputDir)}/`);
  console.log("═".repeat(70) + "\n");
  console.log("📌 للاستخدام:");
  console.log("   import { registerAllGeneratedTools } from './generated/index.js';");
  console.log("   registerAllGeneratedTools(server, client);\n");
}

main().catch((err) => {
  console.error("❌ خطأ:", err);
  process.exit(1);
});