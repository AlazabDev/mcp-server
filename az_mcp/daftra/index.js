/**
 * ═══════════════════════════════════════════════════════════════
 * 🧠 Daftra MCP Server — Dual Transport (Stdio + HTTP/SSE)
 * ═══════════════════════════════════════════════════════════════
 *
 * هذا السيرفر يدعم وضعين للتشغيل:
 *   1. stdio  → Claude Desktop / Cursor / أي MCP client محلي
 *   2. http   → Azure AI Foundry / OpenAI Agents / أي وكيل GPT عن بُعد
 *
 * 📌 ملاحظة عن شهادات HTTPS:
 *   لو ظهر خطأ "UNABLE_TO_VERIFY_LEAF_SIGNATURE" (Avast/AVG/Kaspersky)،
 *   صدّر شهادة برنامج الحماية وأضفها كمتغيّر بيئة:
 *     export NODE_EXTRA_CA_CERTS=/path/to/avast-root.pem
 *   ⚠️ لا يمكن تعيينه من داخل الكود — Node يقرأه مرة واحدة عند الإقلاع.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "node:http";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// 📌 1. الإعدادات (متوافقة مع البنية الموجودة)
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  apiKey: process.env.DAFTRA_API_KEY || "",
  subdomain: process.env.DAFTRA_SUBDOMAIN || "",
  // ملاحظة: docs.daftara.dev يذكر daftara.com لكن الـ API الفعلي على daftra.com
  domain: process.env.DAFTRA_API_DOMAIN || "daftra.com",
  // وضع التشغيل: stdio | http | both
  transport: (process.env.MCP_TRANSPORT || "stdio").toLowerCase(),
  // منفذ HTTP (لوضع http)
  httpPort: parseInt(process.env.MCP_HTTP_PORT || "8765", 10),
  // مفتاح حماية لـ HTTP (يُرسَل في Authorization: Bearer)
  httpAuthToken: process.env.MCP_HTTP_AUTH_TOKEN || "",
  // مستوى التفاصيل في السجلات
  logLevel: process.env.MCP_LOG_LEVEL || "info",
};

const BASE_URL = `https://${CONFIG.subdomain}.${CONFIG.domain}/api2`;

// ═══════════════════════════════════════════════════════════════
// 📌 2. طبقة الاتصال بـ Daftra (HTTP + إعادة محاولة + قواطع)
// ═══════════════════════════════════════════════════════════════

function credsError() {
  if (!CONFIG.apiKey || !CONFIG.subdomain) {
    return (
      "❌ بيانات الاتصال بـ Daftra غير مكتملة.\n" +
      "  • DAFTRA_API_KEY " + (CONFIG.apiKey ? "✔" : "✘") + "\n" +
      "  • DAFTRA_SUBDOMAIN " + (CONFIG.subdomain ? "✔" : "✘") + "\n" +
      "  اضبط المتغيّرات في .env أو في إعدادات العميل."
    );
  }
  return null;
}

/**
 * طلب HTTP موحّد مع إعادة محاولة تلقائية عند الأخطاء العابرة
 */
async function daftraFetch(method, path, { query, body, timeout = 60000 } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        if (Array.isArray(v)) {
          v.forEach((item) => url.searchParams.append(k, String(item)));
        } else {
          url.searchParams.set(k, String(v));
        }
      }
    }
  }

  const headers = {
    apikey: CONFIG.apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "daftra-mcp/1.0.0",
  };

  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(timeout),
  };
  if (body !== undefined) options.body = JSON.stringify(body);

  let lastErr;
  // إعادة المحاولة مرتين عند أخطاء الشبكة
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `رد غير متوقع من Daftra (HTTP ${res.status}): ${text.slice(0, 300)}`
        );
      }

      if (!res.ok) {
        const msg = json.message || json.error || JSON.stringify(json).slice(0, 300);
        throw new Error(`خطأ Daftra (HTTP ${res.status}): ${msg}`);
      }
      return json;
    } catch (e) {
      lastErr = e;
      // لا نعيد المحاولة لو الخطأ 4xx
      if (/\bHTTP 4\d\d\b/.test(e.message)) break;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 500));
    }
  }

  const cause = lastErr?.cause
    ? ` (${lastErr.cause.code || ""} ${lastErr.cause.message || lastErr.cause})`
    : "";
  throw new Error(`تعذّر الاتصال بـ ${url.origin}${cause}: ${lastErr.message}`);
}

const daftraGet = (path, query, opts) =>
  daftraFetch("GET", path.endsWith(".json") ? path : `${path}.json`, { query, ...opts });

const daftraPost = (path, body, query) =>
  daftraFetch("POST", path.endsWith(".json") ? path : `${path}.json`, { body, query });

const daftraPut = (path, body) =>
  daftraFetch("PUT", path.endsWith(".json") ? path : `${path}.json`, { body });

const daftraDelete = (path, query) =>
  daftraFetch("DELETE", path.endsWith(".json") ? path : `${path}.json`, { query });

// ═══════════════════════════════════════════════════════════════
// 📌 3. أدوات مساعدة موحّدة
// ═══════════════════════════════════════════════════════════════

function ok(json, customPrefix = null) {
  const count = Array.isArray(json.data)
    ? json.data.length
    : json.data
    ? 1
    : 0;
  const pag = json.pagination
    ? ` | صفحة ${json.pagination.page}/${json.pagination.page_count} (إجمالي ${json.pagination.total_results})`
    : "";
  const header = customPrefix || `✅ تم الجلب: ${count} عنصر${pag}`;
  return {
    content: [{ type: "text", text: `${header}\n\n${JSON.stringify(json.data ?? json, null, 2)}` }],
  };
}

function fail(message) {
  return { content: [{ type: "text", text: `❌ ${message}` }], isError: true };
}

/**
 * مُغلّف موحّد لأي أداة قراءة
 */
async function runRead(path, query) {
  const err = credsError();
  if (err) return fail(err);
  try {
    return ok(await daftraGet(path, query));
  } catch (e) {
    return fail(e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 📌 4. تعريف مجموعات الأدوات (Tools Registry)
//      كل أداة: { name, description, schema, handler }
//      مُصنَّفة حسب الوحدات لتسهيل الصيانة
// ═══════════════════════════════════════════════════════════════

const pageLimit = {
  page: z.number().int().positive().optional().describe("رقم الصفحة (افتراضي 1)"),
  limit: z.number().int().positive().max(1000).optional().describe("عدد العناصر بالصفحة (افتراضي 20)"),
};

const dateRange = {
  date_from: z.string().optional().describe("من تاريخ YYYY-MM-DD"),
  date_to: z.string().optional().describe("إلى تاريخ YYYY-MM-DD"),
};

const Tools = {
  // ───────────────────────────────────────────────────────────
  // 🔐 4.1 عام / التحقق
  // ─────────────────────────────────────────────────────────────
  site: [
    {
      name: "daftra_get_site_info",
      description: "التحقق من الاتصال بحساب Daftra وعرض معلومات الحساب (الاسم، العملة، حالة الاشتراك، الإصدار)",
      schema: {},
      handler: () => runRead("/site_info", {}),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 💰 4.2 الفواتير
  // ─────────────────────────────────────────────────────────────
  invoices: [
    {
      name: "daftra_get_invoices",
      description: "قراءة قائمة الفواتير مع فلترة متقدمة",
      schema: {
        ...pageLimit,
        ...dateRange,
        client_id: z.number().optional().describe("رقم العميل"),
        payment_status: z.number().optional().describe("-1 مسودة | -2 مستحقة | -3 متأخرة | 0 غير مدفوعة | 1 جزئي | 2 مدفوعة | 4 زيادة"),
        keywords: z.string().optional().describe("بحث في اسم العميل أو رقم الفاتورة"),
        currency_code: z.string().optional().describe("رمز العملة مثل EGP/USD"),
        recursive: z.number().optional().describe("1 لإرجاع البنود والدفعات والضرائب"),
      },
      handler: (a) => runRead("/invoices", a),
    },
    {
      name: "daftra_get_invoice_by_id",
      description: "قراءة فاتورة واحدة بكل تفاصيلها",
      schema: { id: z.number().describe("معرف الفاتورة") },
      handler: ({ id }) => runRead(`/invoices/${id}`, {}),
    },
    {
      name: "daftra_get_subscriptions",
      description: "قراءة قائمة الاشتراكات (الفواتير المتكرّرة)",
      schema: { ...pageLimit, client_id: z.number().optional() },
      handler: (a) => runRead("/invoices/subscription", a),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 🧾 4.3 عروض الأسعار / إشعارات دائن / مرتجعات
  // ─────────────────────────────────────────────────────────────
  estimates: [
    {
      name: "daftra_get_estimates",
      description: "قراءة قائمة عروض الأسعار",
      schema: { ...pageLimit, ...dateRange, client_id: z.number().optional() },
      handler: (a) => runRead("/estimates", a),
    },
    {
      name: "daftra_get_estimate_by_id",
      description: "قراءة عرض سعر واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/estimates/${id}`, {}),
    },
  ],

  credit_notes: [
    {
      name: "daftra_get_credit_notes",
      description: "قراءة قائمة إشعارات الدائن (Credit Notes)",
      schema: { ...pageLimit, ...dateRange, client_id: z.number().optional() },
      handler: (a) => runRead("/credit_notes", a),
    },
    {
      name: "daftra_get_credit_note_by_id",
      description: "قراءة إشعار دائن واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/credit_notes/${id}`, {}),
    },
  ],

  refund_receipts: [
    {
      name: "daftra_get_refund_receipts",
      description: "قراءة قائمة إيصالات الاسترجاع",
      schema: { ...pageLimit, ...dateRange, client_id: z.number().optional() },
      handler: (a) => runRead("/refund_receipts", a),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 💳 4.4 المدفوعات
  // ─────────────────────────────────────────────────────────────
  payments: [
    {
      name: "daftra_get_invoice_payments",
      description: "قراءة مدفوعات الفواتير",
      schema: {
        ...pageLimit,
        ...dateRange,
        client_id: z.number().optional(),
        payment_method: z.string().optional().describe("cash / bank / cheque / ..."),
        sort: z.string().optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        include_starting_balance: z.number().optional().describe("1 لتضمين الرصيد الافتتاحي"),
      },
      handler: (a) => runRead("/invoice_payments", a),
    },
    {
      name: "daftra_get_invoice_payment_by_id",
      description: "قراءة دفعة فاتورة واحدة",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/invoice_payments/${id}`, {}),
    },
    {
      name: "daftra_get_client_payments",
      description: "قراءة مدفوعات العملاء",
      schema: { ...pageLimit, ...dateRange, client_id: z.number().optional() },
      handler: (a) => runRead("/client_payments", a),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 👥 4.5 العملاء
  // ─────────────────────────────────────────────────────────────
  clients: [
    {
      name: "daftra_get_clients",
      description: "قراءة قائمة العملاء",
      schema: {
        ...pageLimit,
        keywords: z.string().optional().describe("بحث بالاسم/البريد/الهاتف/الرقم"),
        assign_staff_id: z.number().optional(),
      },
      handler: (a) => runRead("/clients", a),
    },
    {
      name: "daftra_get_client_by_id",
      description: "قراءة عميل واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/clients/${id}`, {}),
    },
    {
      name: "daftra_get_client_loyalty_points",
      description: "قراءة رصيد نقاط الولاء لعميل",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/clients/loyalty-points/${id}`, {}),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 📦 4.6 المخزون — المنتجات
  // ─────────────────────────────────────────────────────────────
  products: [
    {
      name: "daftra_get_products",
      description: "قراءة قائمة المنتجات مع فلترة شاملة",
      schema: {
        ...pageLimit,
        keywords: z.string().optional(),
        category: z.number().optional(),
        supplier_id: z.number().optional(),
        brand_id: z.number().optional(),
        status: z.number().optional().describe("1=متوفر | 2=مخزون منخفض | 3=نفذ | 4=غير نشط | 5=موقوف"),
        barcode: z.string().optional(),
        product_code: z.string().optional(),
        load_custom_data: z.number().optional().describe("1 لتضمين الحقول المخصصة"),
      },
      handler: (a) => runRead("/products", a),
    },
    {
      name: "daftra_get_product_by_id",
      description: "قراءة منتج واحد بكل تفاصيله",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/products/${id}`, {}),
    },
    {
      name: "daftra_get_product_brands",
      description: "قراءة قائمة الماركات المتاحة",
      schema: { brand: z.string().optional() },
      handler: (a) => runRead("/products/brands", a),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 🗂️ 4.7 المخزون — الفئات والمخازن
  // ─────────────────────────────────────────────────────────────
  categories: [
    {
      name: "daftra_get_product_categories",
      description: "قراءة فئات المنتجات",
      schema: {
        ...pageLimit,
        parent_id: z.number().optional(),
        id: z.number().optional(),
      },
      handler: (a) => runRead("/product_categories", a),
    },
    {
      name: "daftra_get_product_category_by_id",
      description: "قراءة فئة منتج واحدة",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/product_categories/${id}`, {}),
    },
  ],

  stores: [
    {
      name: "daftra_get_stores",
      description: "قراءة قائمة المخازن (محدودة بصلاحيات المستخدم)",
      schema: { ...pageLimit },
      handler: (a) => runRead("/stores", a),
    },
    {
      name: "daftra_get_store_by_id",
      description: "قراءة مخزن واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/stores/${id}`, {}),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 📊 4.8 المخزون — الحركات والطلبات
  // ─────────────────────────────────────────────────────────────
  stock_transactions: [
    {
      name: "daftra_get_stock_transactions",
      description: "قراءة حركات المخزون المعالجة فقط",
      schema: {
        ...pageLimit,
        ...dateRange,
        product_id: z.number().optional(),
        store_id: z.number().optional(),
        source_type: z.string().optional().describe("1=يدوي | 2=فاتورة | 3=شراء | 4=إشعار | 5=تحويل | 9=طلب | 14=خصم"),
        transaction_category_id: z.number().optional(),
      },
      handler: (a) => runRead("/stock_transactions", a),
    },
    {
      name: "daftra_get_stock_transaction_by_id",
      description: "قراءة حركة مخزون واحدة",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/stock_transactions/${id}`, {}),
    },
  ],

  requisitions: [
    {
      name: "daftra_get_requisitions",
      description: "قراءة طلبات المخزون (استلام/صرف/تحويل)",
      schema: {
        ...pageLimit,
        store_id: z.number().optional(),
        pos_shift_id: z.number().optional(),
      },
      handler: (a) => runRead("/requisitions", a),
    },
    {
      name: "daftra_get_requisition_by_id",
      description: "قراءة طلب مخزون واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/requisitions/${id}`, {}),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 🛒 4.9 المشتريات والموردين
  // ─────────────────────────────────────────────────────────────
  purchases: [
    {
      name: "daftra_get_purchase_invoices",
      description: "قراءة فواتير الشراء",
      schema: { ...pageLimit, ...dateRange, payment_status: z.number().optional() },
      handler: (a) => runRead("/purchase_invoices", a),
    },
    {
      name: "daftra_get_purchase_invoice_by_id",
      description: "قراءة فاتورة شراء واحدة",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/purchase_invoices/${id}`, {}),
    },
    {
      name: "daftra_get_purchase_orders",
      description: "قراءة أوامر الشراء",
      schema: { ...pageLimit, ...dateRange },
      handler: (a) => runRead("/purchase_orders", a),
    },
    {
      name: "daftra_get_purchase_order_by_id",
      description: "قراءة أمر شراء واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/purchase_orders/${id}`, {}),
    },
    {
      name: "daftra_get_purchase_refunds",
      description: "قراءة مرتجعات الشراء",
      schema: { ...pageLimit, ...dateRange, supplier_id: z.number().optional() },
      handler: (a) => runRead("/purchase_refunds", a),
    },
  ],

  suppliers: [
    {
      name: "daftra_get_suppliers",
      description: "قراءة قائمة الموردين",
      schema: {
        ...pageLimit,
        name: z.string().optional(),
        country_code: z.string().optional(),
        status: z.number().optional().describe("0=نشط | 1=موقوف"),
      },
      handler: (a) => runRead("/suppliers", a),
    },
    {
      name: "daftra_get_supplier_by_id",
      description: "قراءة مورد واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/suppliers/${id}`, {}),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 💵 4.10 المالية والمحاسبة
  // ─────────────────────────────────────────────────────────────
  finance: [
    {
      name: "daftra_get_expenses",
      description: "قراءة المصروفات",
      schema: {
        ...pageLimit,
        ...dateRange,
        expense_category_id: z.number().optional(),
        vendor: z.string().optional(),
        client_id: z.number().optional(),
        status: z.enum(["draft", "issued"]).optional(),
      },
      handler: (a) => runRead("/expenses", a),
    },
    {
      name: "daftra_get_expense_by_id",
      description: "قراءة مصروف واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/expenses/${id}`, {}),
    },
    {
      name: "daftra_get_incomes",
      description: "قراءة الإيرادات",
      schema: { ...pageLimit, ...dateRange, status: z.enum(["draft", "issued"]).optional() },
      handler: (a) => runRead("/incomes", a),
    },
    {
      name: "daftra_get_treasuries",
      description: "قراءة الخزائن والحسابات البنكية مع أرصدتها",
      schema: { ...pageLimit },
      handler: (a) => runRead("/treasuries", a),
    },
  ],

  journals: [
    {
      name: "daftra_get_journals",
      description: "قراءة قيود اليومية",
      schema: {
        ...pageLimit,
        description: z.string().optional(),
        number: z.string().optional(),
        draft: z.number().optional().describe("0=معتمد | 1=مسودة"),
        ...dateRange,
      },
      handler: (a) => runRead("/journals", a),
    },
    {
      name: "daftra_get_journal_by_id",
      description: "قراءة قيد يومية واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/journals/${id}`, {}),
    },
    {
      name: "daftra_get_journal_accounts",
      description: "قراءة دليل الحسابات (شجرة الحسابات) مع الأرصدة",
      schema: {
        ...pageLimit,
        journal_cat_id: z.number().optional(),
        has_cost_centers: z.number().optional(),
      },
      handler: (a) => runRead("/journal_accounts", a),
    },
    {
      name: "daftra_get_journal_cats",
      description: "قراءة تصنيفات دليل الحسابات",
      schema: { ...pageLimit },
      handler: (a) => runRead("/journal_cats", a),
    },
    {
      name: "daftra_get_taxes",
      description: "قراءة قائمة الضرائب",
      schema: { is_active: z.number().optional() },
      handler: (a) => runRead("/taxes", a),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 👔 4.11 الموارد البشرية
  // ─────────────────────────────────────────────────────────────
  hr: [
    {
      name: "daftra_get_staff",
      description: "قراءة قائمة الموظفين",
      schema: {
        ...pageLimit,
        name: z.string().optional(),
        email_address: z.string().optional(),
      },
      handler: (a) => runRead("/staff", a),
    },
    {
      name: "daftra_get_staff_by_id",
      description: "قراءة موظف واحد",
      schema: { id: z.number() },
      handler: ({ id }) => runRead(`/staff/${id}`, {}),
    },
    {
      name: "daftra_get_attendance_logs",
      description: "قراءة سجل الحضور والانصراف (v2 API)",
      schema: { page: z.number().optional() },
      handler: (a) => runRead("/v2/api/entity/attendance_log/list/1", a),
    },
    {
      name: "daftra_get_leave_applications",
      description: "قراءة طلبات الإجازات (v2 API)",
      schema: {
        page: z.number().optional(),
        status: z.enum(["all", "pending", "approved", "rejected", "pending_on_me"]).optional(),
      },
      handler: (a) => runRead("/v2/api/entity/leave_application/list/1", a),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 🌿 4.12 الفروع
  // ─────────────────────────────────────────────────────────────
  branches: [
    {
      name: "daftra_get_branches",
      description: "قراءة قائمة الفروع (يتطلب تفعيل Branches plugin)",
      schema: { page: z.number().optional() },
      handler: (a) => runRead("/v2/api/entity/branch/list/1", a),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 📈 4.13 التقارير
  // ─────────────────────────────────────────────────────────────
  reports: [
    {
      name: "daftra_report_sales_revenue",
      description: "تقرير إيرادات المبيعات",
      schema: {
        report_type: z.enum(["invoice", "period", "client", "staff", "sales_person"]),
        group_by: z.enum(["daily", "weekly", "monthly", "yearly", "lastyear", "lastmonth"]).optional(),
        ...dateRange,
        currency: z.string().optional().describe("-1 للتحويل إلى العملة الأساسية"),
      },
      handler: (a) => runRead("/reports/revenue", a),
    },
    {
      name: "daftra_report_product_sales",
      description: "تقرير مبيعات المنتجات",
      schema: {
        group_by: z.enum([
          "daily", "weekly", "monthly", "yearly",
          "product", "category", "brand", "staff", "sales_person", "client", "collected_by"
        ]).optional(),
        is_summary: z.number().optional().describe("0=تفصيلي | 1=ملخص"),
        ...dateRange,
      },
      handler: (a) => runRead("/reports/products", a),
    },
    {
      name: "daftra_report_payments",
      description: "تقرير الدفعات",
      schema: {
        group_by: z.enum(["daily", "weekly", "monthly", "yearly", "client", "staff", "collected_by", "payment_method"]).optional(),
        is_summary: z.number().optional(),
        ...dateRange,
      },
      handler: (a) => runRead("/reports/payments", a),
    },
    {
      name: "daftra_report_profit_loss_accrual",
      description: "تقرير الأرباح والخسائر (على أساس الاستحقاق)",
      schema: {
        ...dateRange,
        group_by_date: z.enum(["monthly", "quarterly", "annually"]).optional(),
        max_level: z.number().min(1).max(7).optional(),
      },
      handler: (a) => runRead("/reports/accounts_profit_accrual", a),
    },
  ],

  // ───────────────────────────────────────────────────────────
  // 🏷️ 4.14 حالات المتابعة (Follow-Up)
  // ─────────────────────────────────────────────────────────────
  followup: [
    {
      name: "daftra_get_followup_statuses",
      description: "قراءة حالات المتابعة حسب النوع (client/invoice/estimate/...)",
      schema: {
        type: z.enum(["client", "invoice", "estimate", "purchase_order", "staff", "supplier", "product", "work_order"]),
      },
      handler: ({ type, ...rest }) => runRead(`/follow_up_statuses/${type}`, rest),
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 📌 5. تسجيل الأدوات في McpServer
// ═══════════════════════════════════════════════════════════════

function buildServer() {
  const server = new McpServer({
    name: "daftra-mcp",
    version: "1.0.0",
  });

  let registered = 0;
  for (const [group, tools] of Object.entries(Tools)) {
    for (const tool of tools) {
      // نحول Zod schema إلى شكل MCP (object خصائص)
      const zodShape = tool.schema;
      server.tool(tool.name, tool.description, zodShape, tool.handler);
      registered++;
    }
  }

  if (CONFIG.logLevel === "info" || CONFIG.logLevel === "debug") {
    console.error(`✅ تم تسجيل ${registered} أداة عبر ${Object.keys(Tools).length} مجموعة`);
  }

  return server;
}

// ═══════════════════════════════════════════════════════════════
// 📌 6. نقل الرسائل — Stdio (Claude) + HTTP/SSE (Foundry)
// ═══════════════════════════════════════════════════════════════

/**
 * وضع Stdio — لـ Claude Desktop و Cursor
 */
async function startStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Daftra MCP يعمل بوضع stdio");
}

/**
 * وضع HTTP/SSE — لـ Azure AI Foundry / OpenAI Agents / أي وكيل GPT
 *
 * نقاط النهاية:
 *   POST /mcp   → استقبال الرسائل
 *   GET  /mcp   → فتح قناة SSE
 *   GET  /health → فحص الصحة
 */
async function startHttp() {
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS (ضروري لو الوكيل يشتغل من نطاق مختلف)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    // فحص الصحة
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        version: "1.0.0",
        tools: Object.values(Tools).flat().length,
        subdomain: CONFIG.subdomain || "(not set)",
      }));
      return;
    }

    // التحقق من رمز الحماية (لو مضبوط)
    if (CONFIG.httpAuthToken) {
      const auth = req.headers["authorization"] || "";
      if (auth !== `Bearer ${CONFIG.httpAuthToken}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    // مسار MCP
    if (url.pathname === "/mcp" || url.pathname === "/") {
      // لكل جلسة ننشئ server + transport مستقلّين (stateless)
      const mcpServer = buildServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — لا جلسات
        enableJsonResponse: true,
      });

      res.on("close", () => {
        transport.close();
        mcpServer.close();
      });

      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (e) {
        console.error("❌ HTTP transport error:", e);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      }
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Not found",
      available: ["POST /mcp", "GET /mcp", "GET /health"],
    }));
  });

  return new Promise((resolve) => {
    httpServer.listen(CONFIG.httpPort, "0.0.0.0", () => {
      console.error(`🚀 Daftra MCP يعمل بوضع http على المنفذ ${CONFIG.httpPort}`);
      console.error(`   • Endpoint : http://0.0.0.0:${CONFIG.httpPort}/mcp`);
      console.error(`   • Health   : http://0.0.0.0:${CONFIG.httpPort}/health`);
      if (CONFIG.httpAuthToken) {
        console.error(`   • Auth     : Bearer <MCP_HTTP_AUTH_TOKEN>`);
      }
      resolve(httpServer);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// 📌 7. نقطة الانطلاق
// ═══════════════════════════════════════════════════════════════

async function main() {
  const mode = CONFIG.transport;
  const err = credsError();
  if (err) {
    console.error(err);
    // لا نُجهض في وضع stdio لأن العميل سيتعامل مع الأخطاء عند كل نداء
    if (mode !== "stdio") process.exit(1);
  }

  if (mode === "http") {
    await startHttp();
  } else if (mode === "both") {
    await startHttp();
    await startStdio();
  } else {
    await startStdio();
  }
}

// معالجة الأخطاء غير المتوقّعة
process.on("uncaughtException", (e) => {
  console.error("❌ uncaughtException:", e);
});
process.on("unhandledRejection", (e) => {
  console.error("❌ unhandledRejection:", e);
});

main().catch((e) => {
  console.error("❌ فشل بدء السيرفر:", e);
  process.exit(1);
});