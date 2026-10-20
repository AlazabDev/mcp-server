/**
 * ═══════════════════════════════════════════════════════════════
 * ✍️ Product Write Tools — منتجات + تسويات مخزون + مخازن
 * ═══════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../../client.js";
import { guard } from "./safety.js";

const confirmTokenSchema = z
  .string()
  .optional()
  .describe("CONFIRM_WRITE");

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: `❌ ${message}` }],
    isError: true,
  };
}

function ok(json: unknown, prefix?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${prefix ?? "✅ تم التنفيذ"}\n\n${JSON.stringify(json, null, 2)}`,
      },
    ],
  };
}

export function registerProductWriteTools(
  server: McpServer,
  client: DaftraClient
): void {
  // ═══════════════════════════════════════════════════════════
  // 1. إنشاء منتج
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_create_product",
    "✍️ [كتابة] إنشاء منتج / خدمة جديدة.",
    {
      confirm_token: confirmTokenSchema,
      name: z.string().describe("اسم المنتج (مطلوب)"),
      type: z.number().optional().describe("1=منتج | 2=خدمة | 3=حزمة"),
      product_code: z.string().optional(),
      barcode: z.string().optional().describe("فريد، 5 أحرف على الأقل"),
      description: z.string().optional(),
      unit_price: z.number().optional(),
      buy_price: z.number().optional(),
      minimum_price: z.number().optional(),
      tax1: z.number().optional(),
      tax2: z.number().optional(),
      brand: z.string().optional(),
      categories_id: z.array(z.number()).optional(),
      tags: z.string().optional(),
      track_stock: z.number().optional().describe("0/1"),
      initial_stock_level: z.number().optional(),
      store_id: z.number().optional(),
      low_stock_thershold: z.number().optional(),
    },
    async ({ confirm_token, ...product }) => {
      const g = guard("create_product", product, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_create: { Product: product } },
          "🧪 [Dry-Run] سيتم إنشاء منتج:"
        );
      }

      const response = await client.post("/products", { Product: product });
      if (response.result === "failed") {
        return fail(response.message || "فشل إنشاء المنتج");
      }
      return ok(
        response,
        `✅ تم إنشاء المنتج | id=${(response as { id?: number }).id ?? "?"}`
      );
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 2. تعديل منتج
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_update_product",
    "✍️ [كتابة] تعديل منتج موجود.",
    {
      confirm_token: confirmTokenSchema,
      id: z.number(),
      name: z.string().optional(),
      unit_price: z.number().optional(),
      buy_price: z.number().optional(),
      minimum_price: z.number().optional(),
      description: z.string().optional(),
      status: z.number().optional().describe("0=نشط | 1=غير نشط | 2=موقوف"),
      low_stock_thershold: z.number().optional(),
    },
    async ({ confirm_token, id, ...product }) => {
      const g = guard("update_product", { id, ...product }, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_update: { id, Product: product } },
          `🧪 [Dry-Run] سيتم تعديل المنتج ${id}`
        );
      }

      const response = await client.put(`/products/${id}`, {
        Product: product,
      });
      if (response.result === "failed") {
        return fail(response.message || "فشل تعديل المنتج");
      }
      return ok(response, `✅ تم تعديل المنتج ${id}`);
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 3. تسوية مخزون
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_adjust_stock",
    "📦 [كتابة] تسوية مخزون — إضافة أو خصم كمية.",
    {
      confirm_token: confirmTokenSchema,
      product_id: z.number().describe("معرف المنتج (مطلوب)"),
      store_id: z.number().describe("معرف المخزن (مطلوب)"),
      quantity: z.number().describe("الكمية (موجبة)"),
      direction: z.enum(["in", "out"]).describe("in=إدخال | out=إخراج"),
      price: z.number().optional(),
      currency_code: z.string().optional(),
      received_date: z.string().optional().describe("YYYY-MM-DD"),
      notes: z.string().optional(),
      transaction_category_id: z.array(z.string()).optional(),
    },
    async ({ confirm_token, direction, ...rest }) => {
      const payload = {
        ...rest,
        transaction_type: direction === "in" ? 1 : 2,
      };
      const g = guard("adjust_stock", payload, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_create: { StockTransaction: payload } },
          "🧪 [Dry-Run] سيتم تسجيل حركة مخزون:"
        );
      }

      const response = await client.post("/stock_transactions", {
        StockTransaction: payload,
      });
      if (response.result === "failed") {
        return fail(response.message || "فشل تعديل المخزون");
      }
      return ok(
        response,
        `✅ تم تحديث المخزون | id=${(response as { id?: number }).id ?? "?"}`
      );
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 4. إنشاء فئة منتج
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_create_product_category",
    "📂 [كتابة] إنشاء فئة منتجات جديدة.",
    {
      confirm_token: confirmTokenSchema,
      name: z.string().describe("اسم الفئة (مطلوب)"),
      parent_id: z.number().optional().describe("0 = فئة رئيسية"),
      description: z.string().optional(),
      display_order: z.number().optional(),
    },
    async ({ confirm_token, ...category }) => {
      const g = guard("create_product_category", category, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_create: { Category: category } },
          "🧪 [Dry-Run]"
        );
      }

      const response = await client.post("/product_categories", {
        Category: { ...category, category_type: 1 },
      });
      if (response.result === "failed") {
        return fail(response.message || "فشل إنشاء الفئة");
      }
      return ok(
        response,
        `✅ تم إنشاء الفئة | id=${(response as { id?: number }).id ?? "?"}`
      );
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 5. إنشاء مخزن
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_create_store",
    "🏢 [كتابة] إنشاء مخزن جديد.",
    {
      confirm_token: confirmTokenSchema,
      name: z.string().describe("اسم المخزن (مطلوب)"),
      shipping_address: z.string().optional(),
      active: z.number().optional().describe("0=غير نشط | 1=نشط | 2=موقوف"),
      primary: z.number().optional().describe("0/1 — مخزن افتراضي"),
    },
    async ({ confirm_token, ...store }) => {
      const g = guard("create_store", store, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_create: { Store: store } },
          "🧪 [Dry-Run]"
        );
      }

      const response = await client.post("/stores", { Store: store });
      if (response.result === "failed") {
        return fail(response.message || "فشل إنشاء المخزن");
      }
      return ok(
        response,
        `✅ تم إنشاء المخزن | id=${(response as { id?: number }).id ?? "?"}`
      );
    }
  );
}