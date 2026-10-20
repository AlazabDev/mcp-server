#!/usr/bin/env tsx
/**
 * 🧠 Daftra OpenAPI Operations Extractor
 * ----------------------------------------
 * يستخرج كل العمليات من ملف daftra.openapi.json
 * ويصنّفها حسب:
 *   - Tag (وسم الـ API)
 *   - Module (الوحدة/النطاق)
 *   - HTTP Method
 *   - CRUD Type (Create/Read/Update/Delete)
 *
 * المخرجات:
 *   - extracted/operations.json              — كل العمليات
 *   - extracted/operations-by-tag.json       — مجمّعة حسب الـ Tag
 *   - extracted/operations-by-module.json    — مجمّعة حسب الوحدة
 *   - extracted/operations-by-crud.json      — مجمّعة حسب CRUD
 *   - extracted/modules/{module}.json        — كل وحدة في ملف منفصل
 *   - extracted/statistics.json              — إحصائيات شاملة
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════
// 📌 الإعدادات
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  openApiPath: path.resolve(__dirname, "..", "daftra.openapi.json"),
  outputDir: path.resolve(__dirname, "..", "extracted"),
  modulesDir: path.resolve(__dirname, "..", "extracted", "modules"),
};

// ═══════════════════════════════════════════════════════════════
// 🏷️ خريطة الوحدات — كل وحدة تحتوي على قائمة tags تنتمي إليها
// ═══════════════════════════════════════════════════════════════

const MODULE_MAP: Record<string, string[]> = {
  authorization: ["Authorization"],
  site: ["Site", "Endpoints/Site"],
  invoices: [
    "Invoices",
    "Endpoints/Sales /Invoices",
    "Endpoints/Sales /Invoice Appointments",
    "Endpoints/Sales /Invoice Payments",
    "Endpoints/Sales /Advance Payment Invoices",
  ],
  subscriptions: [
    "Endpoints/Sales /Subsciptions",
  ],
  estimates: ["Estimates", "Endpoints/Sales /Estimates"],
  "credit-notes": ["Credit Notes", "Endpoints/Sales /Credit Notes"],
  "refund-receipts": [
    "Refund Receipts",
    "Endpoints/Sales /Refund Receipts",
  ],
  "invoice-payments": ["Invoice Payments"],
  pos: ["POS", "Endpoints/Sales /POS"],
  "shipping-options": ["Shipping Options"],
  "follow-up-statuses": ["Follow Up Statuses", "Endpoints/Follow-Up Statuses", "Endpoints/Sales /Follow-Up Status"],
  "follow-up-actions": ["Follow Up Actions", "Endpoints/Clients /Follow-Up Action"],
  clients: [
    "Clients",
    "Endpoints/Clients /Clients",
    "Endpoints/Clients /Client Appointments",
    "Endpoints/Clients /Client Payments",
    "Endpoints/Clients /Client Attendance Log",
    "Endpoints/Clients /Notes",
  ],
  appointments: [
    "Client Appointments",
    "Estimate Appointments",
    "Invoice Appointments",
    "Endpoints/Sales /Estimate Appointments",
    "Endpoints/Work Orders/Work Order Appointments",
  ],
  "client-payments": ["Client Payments", "Endpoints/Clients /Client Payments"],
  notes: ["Notes"],
  bookings: [
    "Endpoints/Bookings",
    "Endpoints/Bookings/Booking (Classic version)",
    "Endpoints/Bookings/Booking (Beta version)",
  ],
  "work-orders": [
    "Work Orders",
    "Endpoints/Work Orders",
    "Endpoints/Work Orders/Work Orders",
  ],
  products: ["Products", "Endpoints/Inventory /Products"],
  requisitions: ["Requisitions", "Endpoints/Inventory /Requsitions"],
  "product-categories": [
    "Product Categories",
    "Endpoints/Inventory /Product Categories",
  ],
  stores: ["Stores", "Endpoints/Inventory /Stores"],
  "stock-transactions": [
    "Stock Transactions",
    "Endpoints/Inventory /Stock Transactions",
  ],
  "product-bundles": ["Endpoints/Inventory /Product Bundles"],
  brands: ["Endpoints/Inventory /Brands"],
  "unit-templates": ["Endpoints/Inventory /Unit Templates"],
  journals: ["Journals", "Endpoints/Accounting/Journals"],
  "journal-accounts": [
    "Journal Accounts",
    "Endpoints/Accounting/Journal Accounts",
  ],
  "journal-cats": ["Journal Cats", "Endpoints/Accounting/Journal Cats"],
  "cost-centers": ["Endpoints/Accounting/Cost Centers"],
  treasuries: ["Treasuries", "Endpoints/Finance/Treasuries"],
  expenses: ["Expenses", "Endpoints/Finance/Expenses"],
  incomes: ["Incomes", "Endpoints/Finance/Incomes"],
  taxes: ["Taxes", "Endpoints/Taxes"],
  "purchase-refunds": [
    "Purchase Refunds",
    "Endpoints/Purchases/Purchase Refunds",
  ],
  "purchase-invoices": [
    "Purchase Invoices",
    "Endpoints/Purchases/Purchase Invoices",
  ],
  "purchase-orders": [
    "Purchase Orders",
    "Endpoints/Purchases/Purchase Orders",
  ],
  "purchase-debit-notes": [
    "Endpoints/Purchases/Purchase Debit Note",
  ],
  suppliers: ["Suppliers", "Endpoints/Suppliers"],
  staff: ["Staff", "Endpoints/Staff"],
  "time-tracking": ["Time Tracking", "Endpoints/Time Tracking"],
  "general-listing": ["General Listing", "Endpoints/General Listing"],
  hr: ["HR", "Endpoints/HR"],
  "leave-applications": ["Endpoints/HR/Leave Application "],
  "attendance-logs": ["Endpoints/HR/Attendance Logs"],
  "employee-assets": [
    "Endpoints/HR/Employee Asset",
    "Endpoints/HR/Employee Asset/Asset",
    "Endpoints/HR/Employee Asset/Asset Type",
    "Endpoints/HR/Employee Asset/Asset Location",
    "Endpoints/HR/Employee Asset/Asset Storage",
  ],
  "organizational-structure": [
    "Endpoints/HR/Organizational Structure",
    "Endpoints/HR/Organizational Structure/Designation",
    "Endpoints/HR/Organizational Structure/Department",
    "Endpoints/HR/Organizational Structure/Employment Type",
  ],
  branches: ["Endpoints/Branches "],
  "payment-gateways": ["Endpoints/Payment Gateways"],
  "points-credits": [
    "Endpoints/Points & Credits",
    "Endpoints/Points & Credits/Credit Charges",
    "Endpoints/Points & Credits/Credit Usage",
    "Endpoints/Points & Credits/Credit Types",
    "Endpoints/Points & Credits/Packages",
    "Endpoints/Points & Credits/Packages Credit Types",
  ],
  workflow: ["Endpoints/Workflow"],
  entities: ["Endpoints/Entities", "Multi Entity Request", "Endpoints/Multi Entity Request"],
  reports: [
    "Endpoints/Reports",
    "Endpoints/Reports/Sales Revenue Report",
    "Endpoints/Reports/Product Sales Report",
    "Endpoints/Reports/Payments Report",
    "Endpoints/Reports/Profit & Loss (Accrual) Report",
  ],
  "advanced-filtering": ["Advanced Filtering", "Advanced Filtering/Using API v2"],
  "developers-portal": [
    "Developers Portal",
    "Developers Portal/Developers Portal Endpoints",
  ],
};

// ═══════════════════════════════════════════════════════════════
// 🧩 الأنواع
// ═══════════════════════════════════════════════════════════════

interface Operation {
  /** معرف فريد: METHOD /path */
  id: string;
  /** المسار */
  path: string;
  /** HTTP Method */
  method: string;
  /** ملخص العملية */
  summary: string;
  /** الوصف الكامل */
  description: string;
  /** الوسوم */
  tags: string[];
  /** الوحدة المستنتجة */
  module: string;
  /** نوع العملية CRUD */
  crudType: "create" | "read" | "update" | "delete" | "action" | "list";
  /** operationId إن وُجد */
  operationId?: string;
  /** deprecated */
  deprecated: boolean;
  /** المعاملات */
  parameters: any[];
  /** جسم الطلب */
  requestBody?: any;
  /** الاستجابات */
  responses: any;
  /** هل يتطلب مصادقة */
  requiresAuth: boolean;
  /** عدد المعاملات */
  parameterCount: number;
  /** هل فيه body */
  hasBody: boolean;
  /** صيغة المخرجات من الاستجابات */
  produces: string[];
}

interface ExtractorStats {
  totalPaths: number;
  totalOperations: number;
  byMethod: Record<string, number>;
  byModule: Record<string, number>;
  byCrudType: Record<string, number>;
  byTag: Record<string, number>;
  deprecated: number;
  withRequestBody: number;
  withParameters: number;
  uniqueTags: number;
  generatedAt: string;
  sourceFile: string;
  sourceSize: number;
}

// ═══════════════════════════════════════════════════════════════
// 🧠 الدوال المساعدة
// ═══════════════════════════════════════════════════════════════

/**
 * استنتاج الوحدة من الـ tags
 */
function detectModule(tags: string[] = []): string {
  const normalizedTags = tags.map((t) => t.trim());

  for (const [module, moduleTags] of Object.entries(MODULE_MAP)) {
    for (const tag of normalizedTags) {
      if (moduleTags.some((mt) => mt.trim() === tag)) {
        return module;
      }
    }
  }

  // fallback: أول وسم أو "other"
  return normalizedTags[0]?.split("/")[0]?.trim() || "other";
}

/**
 * استنتاج نوع العملية CRUD
 */
function detectCrudType(
  method: string,
  path: string,
  summary: string
): Operation["crudType"] {
  const m = method.toLowerCase();
  const s = summary.toLowerCase();
  const p = path.toLowerCase();

  if (m === "post") {
    if (s.includes("add new") || s.includes("create") || p.includes("/add")) {
      return "create";
    }
    if (s.includes("edit") || s.includes("update") || s.includes("trigger")) {
      return "update";
    }
    return "create";
  }
  if (m === "put" || m === "patch") return "update";
  if (m === "delete") return "delete";
  if (m === "get") {
    if (s.includes("all") || s.includes("list") || p.includes("/list")) {
      return "list";
    }
    if (
      s.includes("single") ||
      p.includes("/{id}") ||
      p.includes("/{ID}") ||
      p.includes("/view")
    ) {
      return "read";
    }
    if (
      s.includes("edit") ||
      s.includes("change") ||
      s.includes("assign") ||
      s.includes("convert") ||
      s.includes("trigger") ||
      s.includes("activate")
    ) {
      return "action";
    }
    return "read";
  }
  return "action";
}

/**
 * استخراج صيغ الإخراج من الاستجابات
 */
function extractProduces(responses: Record<string, any> = {}): string[] {
  const set = new Set<string>();
  for (const resp of Object.values(responses)) {
    if (resp?.content && typeof resp.content === "object") {
      for (const ct of Object.keys(resp.content)) {
        set.add(ct);
      }
    }
  }
  return Array.from(set);
}

/**
 * هل العملية تتطلب مصادقة؟
 */
function detectAuth(operation: any): boolean {
  const security = operation.security;
  if (Array.isArray(security)) {
    if (security.length === 0) return false; // مصفوفة فارغة = مفتوح
    return true;
  }
  // إذا غير محددة، نفترض أنها تتطلب (بسبب الـ securitySchemes العامة)
  return true;
}

/**
 * استخراج جميع العمليات من ملف OpenAPI
 */
function extractAllOperations(spec: any): Operation[] {
  const operations: Operation[] = [];
  const paths: Record<string, any> = spec.paths || {};

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const [method, op] of Object.entries(pathItem)) {
      const httpMethods = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];
      if (!httpMethods.includes(method.toLowerCase())) continue;

      const operation = op as any;
      const tags: string[] = operation.tags || [];
      const summary = operation.summary || "";
      const module = detectModule(tags);
      const crudType = detectCrudType(method, pathKey, summary);
      const parameters = operation.parameters || [];
      const requestBody = operation.requestBody;
      const responses = operation.responses || {};

      const opRecord: Operation = {
        id: `${method.toUpperCase()} ${pathKey}`,
        path: pathKey,
        method: method.toUpperCase(),
        summary,
        description: operation.description || "",
        tags: tags.map((t) => t.trim()),
        module,
        crudType,
        operationId: operation.operationId,
        deprecated: operation.deprecated === true,
        parameters,
        requestBody,
        responses,
        requiresAuth: detectAuth(operation),
        parameterCount: parameters.length,
        hasBody: !!requestBody,
        produces: extractProduces(responses),
      };

      operations.push(opRecord);
    }
  }

  return operations;
}

/**
 * تجميع العمليات حسب مفتاح معيّن
 */
function groupBy<T>(arr: T[], keyFn: (item: T) => string | string[]): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const keys = keyFn(item);
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) {
      if (!result[k]) result[k] = [];
      result[k].push(item);
    }
  }
  return result;
}

/**
 * عدّ التكرارات
 */
function countBy<T>(arr: T[], keyFn: (item: T) => string | string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of arr) {
    const keys = keyFn(item);
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) {
      result[k] = (result[k] || 0) + 1;
    }
  }
  return result;
}

/**
 * كتابة JSON بشكل جميل
 */
function writeJson(filePath: string, data: any): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * طباعة سطر إنجليزي ملون
 */
function log(icon: string, message: string): void {
  console.log(`${icon}  ${message}`);
}

// ═══════════════════════════════════════════════════════════════
// 🚀 السكربت الرئيسي
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("\n" + "═".repeat(70));
  log("🧠", "Daftra OpenAPI Operations Extractor");
  console.log("═".repeat(70) + "\n");

  // 1. التحقق من وجود الملف
  if (!fs.existsSync(CONFIG.openApiPath)) {
    console.error(`❌ لم يُعثر على الملف: ${CONFIG.openApiPath}`);
    process.exit(1);
  }

  const sourceSize = fs.statSync(CONFIG.openApiPath).size;
  log("📖", `قراءة الملف: ${path.basename(CONFIG.openApiPath)} (${(sourceSize / 1024 / 1024).toFixed(2)} MB)`);

  // 2. قراءة وتحليل الملف
  const raw = fs.readFileSync(CONFIG.openApiPath, "utf-8");
  let spec: any;
  try {
    spec = JSON.parse(raw);
  } catch (e) {
    console.error("❌ فشل في تحليل JSON:", e);
    process.exit(1);
  }

  log("✅", `تم التحليل بنجاح — OpenAPI ${spec.openapi}`);

  // 3. استخراج العمليات
  log("🔍", "استخراج العمليات...");
  const operations = extractAllOperations(spec);
  const totalPaths = Object.keys(spec.paths || {}).length;

  log("📊", `تم استخراج ${operations.length} عملية من ${totalPaths} مسار`);

  // 4. تجميع حسب الـ Tag
  log("🏷️", "تجميع حسب الـ Tag...");
  const byTag = groupBy(operations, (op) => (op.tags.length ? op.tags : ["untagged"]));

  // 5. تجميع حسب الوحدة
  log("📦", "تجميع حسب الوحدة...");
  const byModule = groupBy(operations, (op) => op.module);

  // 6. تجميع حسب CRUD
  log("⚙️", "تجميع حسب نوع العملية...");
  const byCrud = groupBy(operations, (op) => op.crudType);

  // 7. تجميع حسب Method
  const byMethod = groupBy(operations, (op) => op.method);

  // 8. الإحصائيات
  const stats: ExtractorStats = {
    totalPaths,
    totalOperations: operations.length,
    byMethod: countBy(operations, (op) => op.method),
    byModule: countBy(operations, (op) => op.module),
    byCrudType: countBy(operations, (op) => op.crudType),
    byTag: countBy(operations, (op) => (op.tags.length ? op.tags : ["untagged"])),
    deprecated: operations.filter((op) => op.deprecated).length,
    withRequestBody: operations.filter((op) => op.hasBody).length,
    withParameters: operations.filter((op) => op.parameterCount > 0).length,
    uniqueTags: Object.keys(byTag).length,
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(CONFIG.openApiPath),
    sourceSize,
  };

  // 9. إنشاء مجلدات الإخراج
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  fs.mkdirSync(CONFIG.modulesDir, { recursive: true });

  // 10. حفظ الملفات الرئيسية
  log("\n💾", "حفظ الملفات...");

  writeJson(path.join(CONFIG.outputDir, "operations.json"), {
    meta: {
      generatedAt: stats.generatedAt,
      source: stats.sourceFile,
      total: operations.length,
    },
    operations,
  });
  log("  ✔", "extracted/operations.json");

  writeJson(path.join(CONFIG.outputDir, "operations-by-tag.json"), byTag);
  log("  ✔", "extracted/operations-by-tag.json");

  writeJson(path.join(CONFIG.outputDir, "operations-by-module.json"), byModule);
  log("  ✔", "extracted/operations-by-module.json");

  writeJson(path.join(CONFIG.outputDir, "operations-by-crud.json"), byCrud);
  log("  ✔", "extracted/operations-by-crud.json");

  writeJson(path.join(CONFIG.outputDir, "operations-by-method.json"), byMethod);
  log("  ✔", "extracted/operations-by-method.json");

  writeJson(path.join(CONFIG.outputDir, "statistics.json"), stats);
  log("  ✔", "extracted/statistics.json");

  // 11. حفظ كل وحدة في ملف منفصل
  log("\n📦", "تقسيم الوحدات إلى ملفات...");
  for (const [module, ops] of Object.entries(byModule)) {
    const fileName = `${module}.json`;
    const filePath = path.join(CONFIG.modulesDir, fileName);
    writeJson(filePath, {
      module,
      count: ops.length,
      operations: ops,
    });
    log("  ✔", `modules/${fileName}  (${ops.length} عملية)`);
  }

  // 12. إنشاء ملف فهرس للوحدات
  const moduleIndex = Object.entries(byModule)
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([module, ops]) => ({
      module,
      count: ops.length,
      byMethod: countBy(ops, (op) => op.method),
      byCrudType: countBy(ops, (op) => op.crudType),
      tags: Array.from(new Set(ops.flatMap((op) => op.tags))),
      file: `modules/${module}.json`,
    }));

  writeJson(path.join(CONFIG.outputDir, "modules-index.json"), moduleIndex);
  log("  ✔", "extracted/modules-index.json");

  // 13. طباعة الملخص
  console.log("\n" + "═".repeat(70));
  log("📊", "الإحصائيات النهائية");
  console.log("═".repeat(70));
  console.log(`\n  • إجمالي المسارات:       ${stats.totalPaths}`);
  console.log(`  • إجمالي العمليات:       ${stats.totalOperations}`);
  console.log(`  • عدد الوسوم الفريدة:    ${stats.uniqueTags}`);
  console.log(`  • عدد الوحدات:           ${Object.keys(byModule).length}`);
  console.log(`  • عمليات مهملة:          ${stats.deprecated}`);
  console.log(`  • عمليات بجسم طلب:       ${stats.withRequestBody}`);
  console.log(`  • عمليات بمعاملات:       ${stats.withParameters}`);

  console.log("\n  📌 حسب Method:");
  for (const [m, c] of Object.entries(stats.byMethod).sort(([, a], [, b]) => b - a)) {
    console.log(`     ${m.padEnd(8)} ${c}`);
  }

  console.log("\n  📌 حسب CRUD:");
  for (const [k, c] of Object.entries(stats.byCrudType).sort(([, a], [, b]) => b - a)) {
    console.log(`     ${k.padEnd(10)} ${c}`);
  }

  console.log("\n  📌 أكبر 15 وحدة:");
  const topModules = Object.entries(stats.byModule)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);
  for (const [mod, c] of topModules) {
    const bar = "█".repeat(Math.min(30, Math.round(c / 3)));
    console.log(`     ${mod.padEnd(28)} ${String(c).padStart(4)}  ${bar}`);
  }

  console.log("\n" + "═".repeat(70));
  log("✅", `تم الانتهاء — المخرجات في: ${path.relative(process.cwd(), CONFIG.outputDir)}/`);
  console.log("═".repeat(70) + "\n");
}

main().catch((err) => {
  console.error("❌ خطأ فادح:", err);
  process.exit(1);
});