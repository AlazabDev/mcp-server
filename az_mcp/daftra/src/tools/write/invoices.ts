/**
 * ═══════════════════════════════════════════════════════════════
 * ✍️ Invoice Write Tools — إنشاء وتعديل وحذف الفواتير
 * ═══════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../../client.js";
import { guard } from "./safety.js";

// ═══════════════════════════════════════════════════════════════
// Schemas مشتركة
// ═══════════════════════════════════════════════════════════════

const confirmTokenSchema = z
  .string()
  .optional()
  .describe(
    "رمز التأكيد الإلزامي. أرسل قيمة WRITE_CONFIRM_PHRASE (افتراضي: CONFIRM_WRITE)"
  );

const invoiceItemSchema = z.object({
  item: z.string().optional().describe("اسم البند"),
  description: z.string().optional().describe("وصف البند"),
  unit_price: z.number().describe("سعر الوحدة"),
  quantity: z.number().describe("الكمية"),
  product_id: z.number().optional().describe("معرف المنتج"),
  tax1: z.number().optional().describe("معرف الضريبة الأولى"),
  tax2: z.number().optional().describe("معرف الضريبة الثانية"),
  discount: z.number().optional().describe("خصم البند"),
  discount_type: z.number().optional().describe("1=نسبة | 2=قيمة"),
  store_id: z.number().optional().describe("المخزن"),
});

const paymentSchema = z.object({
  payment_method: z.string().describe("cash | bank | cheque (مطلوب)"),
  amount: z.number().describe("مبلغ الدفعة"),
  transaction_id: z.string().optional(),
  treasury_id: z.number().optional(),
  date: z.string().optional().describe("YYYY-MM-DD"),
  staff_id: z.number().optional(),
});

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: `❌ ${message}` }],
    isError: true,
  };
}

function ok(json: unknown, prefix?: string) {
  const header = prefix ?? "✅ تم التنفيذ";
  return {
    content: [
      {
        type: "text" as const,
        text: `${header}\n\n${JSON.stringify(json, null, 2)}`,
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// المسجِّل الرئيسي
// ═══════════════════════════════════════════════════════════════

export function registerInvoiceWriteTools(
  server: McpServer,
  client: DaftraClient
): void {
  // ═══════════════════════════════════════════════════════════
  // 1. إنشاء فاتورة
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_create_invoice",
    "✍️ [كتابة] إنشاء فاتورة جديدة. يتطلّب confirm_token.",
    {
      confirm_token: confirmTokenSchema,
      client_id: z.number().describe("معرف العميل (مطلوب)"),
      date: z.string().optional().describe("تاريخ الفاتورة YYYY-MM-DD"),
      currency_code: z.string().optional().describe("رمز العملة مثل EGP"),
      draft: z.boolean().optional().describe("حفظ كمسودة"),
      discount: z.number().optional().describe("نسبة خصم عام"),
      discount_amount: z.number().optional().describe("مبلغ خصم عام"),
      notes: z.string().optional(),
      po_number: z.string().optional(),
      branch_id: z.number().optional(),
      store_id: z.number().optional(),
      items: z.array(invoiceItemSchema).optional().describe("بنود الفاتورة"),
      payments: z.array(paymentSchema).optional().describe("دفعات مصاحبة"),
    },
    async ({ confirm_token, items, payments, ...invoice }) => {
      const g = guard("create_invoice", invoice, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          {
            dry_run: true,
            would_create: {
              Invoice: invoice,
              InvoiceItem: items || [],
              Payment: payments || [],
            },
          },
          "🧪 [Dry-Run] سيتم إنشاء فاتورة:"
        );
      }

      const body: Record<string, unknown> = {
        Invoice: {
          ...invoice,
          discount: invoice.discount ?? 0,
          discount_amount: invoice.discount_amount ?? 0,
        },
        InvoiceItem: items || [],
      };
      if (payments && payments.length) body.Payment = payments;

      const response = await client.post("/invoices", body);
      if (response.result === "failed") {
        return fail(response.message || "فشل إنشاء الفاتورة");
      }
      return ok(
        response,
        `✅ تم إنشاء الفاتورة | id=${(response as { id?: number }).id ?? "?"}`
      );
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 2. تعديل فاتورة
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_update_invoice",
    "✍️ [كتابة] تعديل فاتورة. البنود المُرسلة تستبدل القديمة بالكامل.",
    {
      confirm_token: confirmTokenSchema,
      id: z.number().describe("معرف الفاتورة (مطلوب)"),
      client_id: z.number().describe("معرف العميل (مطلوب)"),
      date: z.string().optional(),
      currency_code: z.string().optional(),
      notes: z.string().optional(),
      draft: z.boolean().optional(),
      discount: z.number().optional(),
      discount_amount: z.number().optional(),
      items: z.array(invoiceItemSchema).optional().describe("البنود الكاملة"),
    },
    async ({ confirm_token, id, items, ...invoice }) => {
      const g = guard("update_invoice", { id, ...invoice }, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_update: { id, Invoice: invoice, InvoiceItem: items || [] } },
          `🧪 [Dry-Run] سيتم تعديل الفاتورة ${id}:`
        );
      }

      const response = await client.put(`/invoices/${id}`, {
        Invoice: invoice,
        InvoiceItem: items || [],
      });
      if (response.result === "failed") {
        return fail(response.message || "فشل تعديل الفاتورة");
      }
      return ok(response, `✅ تم تعديل الفاتورة ${id}`);
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 3. حذف فاتورة
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_delete_invoice",
    "🗑️ [كتابة] حذف فاتورة نهائياً. عملية خطيرة — تتطلّب تأكيداً.",
    {
      confirm_token: confirmTokenSchema,
      id: z.number().describe("معرف الفاتورة (مطلوب)"),
    },
    async ({ confirm_token, id }) => {
      const g = guard("delete_invoice", { id }, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_delete: { id } },
          `🧪 [Dry-Run] سيتم حذف الفاتورة ${id}`
        );
      }

      const response = await client.delete(`/invoices/${id}`);
      if (response.result === "failed") {
        return fail(response.message || "فشل حذف الفاتورة");
      }
      return ok(response, `✅ تم حذف الفاتورة ${id}`);
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 4. إصدار مسودة
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_issue_draft_invoice",
    "📤 [كتابة] إصدار فاتورة مسودة (تحويلها لفاتورة رسمية)",
    {
      confirm_token: confirmTokenSchema,
      id: z.number().describe("معرف الفاتورة المسودة"),
    },
    async ({ confirm_token, id }) => {
      const g = guard("issue_draft_invoice", { id }, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_issue: { id } },
          `🧪 [Dry-Run] سيتم إصدار الفاتورة ${id}`
        );
      }

      const response = await client.get(`/invoices/update_draft/${id}/0`);
      if (response.result === "failed") {
        return fail(response.message || "فشل إصدار الفاتورة");
      }
      return ok(response, `✅ تم إصدار الفاتورة ${id}`);
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 5. إضافة دفعة على فاتورة
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_add_invoice_payment",
    "💵 [كتابة] تسجيل دفعة على فاتورة",
    {
      confirm_token: confirmTokenSchema,
      invoice_id: z.number().describe("معرف الفاتورة (مطلوب)"),
      amount: z.number().describe("المبلغ (مطلوب)"),
      payment_method: z.string().describe("cash | bank | cheque (مطلوب)"),
      date: z.string().optional().describe("YYYY-MM-DD"),
      transaction_id: z.string().optional(),
      treasury_id: z.number().optional(),
    },
    async ({ confirm_token, ...payment }) => {
      const g = guard("add_invoice_payment", payment, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_create: { InvoicePayment: payment } },
          "🧪 [Dry-Run] سيتم تسجيل دفعة:"
        );
      }

      const response = await client.post("/invoice_payments", {
        InvoicePayment: payment,
      });
      if (response.result === "failed") {
        return fail(response.message || "فشل تسجيل الدفعة");
      }
      return ok(
        response,
        `✅ تم تسجيل الدفعة | id=${(response as { id?: number }).id ?? "?"}`
      );
    }
  );
}