/**
 * ═══════════════════════════════════════════════════════════════
 * ✍️ Client Write Tools — إنشاء وتعديل وحذف العملاء
 * ═══════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../../client.js";
import { guard } from "./safety.js";

const confirmTokenSchema = z
  .string()
  .optional()
  .describe("رمز التأكيد الإلزامي: CONFIRM_WRITE");

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

export function registerClientWriteTools(
  server: McpServer,
  client: DaftraClient
): void {
  // ═══════════════════════════════════════════════════════════
  // 1. إنشاء عميل
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_create_client",
    "✍️ [كتابة] إنشاء عميل جديد. business_name مطلوب.",
    {
      confirm_token: confirmTokenSchema,
      business_name: z.string().describe("اسم العميل / الشركة (مطلوب)"),
      type: z.number().optional().describe("2=فرد | 3=شركة"),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().optional(),
      phone1: z.string().optional(),
      phone2: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe("مثل EG، SA"),
      default_currency_code: z.string().optional(),
      credit_limit: z.number().optional(),
      credit_period: z.number().optional(),
      notes: z.string().optional(),
      is_offline: z.boolean().optional(),
      send_notify: z.boolean().optional(),
    },
    async ({ confirm_token, ...clientData }) => {
      const g = guard("create_client", clientData, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_create: { Client: clientData } },
          "🧪 [Dry-Run] سيتم إنشاء عميل:"
        );
      }

      const response = await client.post("/clients", { Client: clientData });
      if (response.result === "failed") {
        return fail(response.message || "فشل إنشاء العميل");
      }
      return ok(
        response,
        `✅ تم إنشاء العميل | id=${(response as { id?: number }).id ?? "?"}`
      );
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 2. تعديل عميل
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_update_client",
    "✍️ [كتابة] تعديل بيانات عميل (تحديث جزئي).",
    {
      confirm_token: confirmTokenSchema,
      id: z.number().describe("معرف العميل (مطلوب)"),
      business_name: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().optional(),
      phone1: z.string().optional(),
      phone2: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional(),
      credit_limit: z.number().optional(),
      credit_period: z.number().optional(),
      notes: z.string().optional(),
      suspend: z.boolean().optional(),
    },
    async ({ confirm_token, id, ...clientData }) => {
      const g = guard("update_client", { id, ...clientData }, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_update: { id, Client: clientData } },
          `🧪 [Dry-Run] سيتم تعديل العميل ${id}`
        );
      }

      const response = await client.put(`/clients/${id}`, {
        Client: clientData,
      });
      if (response.result === "failed") {
        return fail(response.message || "فشل تعديل العميل");
      }
      return ok(response, `✅ تم تعديل العميل ${id}`);
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 3. حذف عميل
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_delete_client",
    "🗑️ [كتابة] حذف عميل (يُرفض إن كان له معاملات مرتبطة).",
    {
      confirm_token: confirmTokenSchema,
      id: z.number().describe("معرف العميل (مطلوب)"),
    },
    async ({ confirm_token, id }) => {
      const g = guard("delete_client", { id }, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_delete: { id } },
          `🧪 [Dry-Run] سيتم حذف العميل ${id}`
        );
      }

      const response = await client.delete(`/clients/${id}`);
      if (response.result === "failed") {
        return fail(response.message || "فشل حذف العميل");
      }
      return ok(response, `✅ تم حذف العميل ${id}`);
    }
  );

  // ═══════════════════════════════════════════════════════════
  // 4. دفعة لعميل (رصيد دائن)
  // ═══════════════════════════════════════════════════════════
  server.tool(
    "daftra_create_client_payment",
    "💵 [كتابة] تسجيل دفعة لعميل (رصيد دائن).",
    {
      confirm_token: confirmTokenSchema,
      client_id: z.number().describe("معرف العميل (مطلوب)"),
      amount: z.number().describe("المبلغ (مطلوب)"),
      payment_method: z.string().describe("cash | bank | cheque (مطلوب)"),
      date: z.string().optional(),
      notes: z.string().optional(),
      treasury_id: z.number().optional(),
    },
    async ({ confirm_token, ...payment }) => {
      const g = guard("create_client_payment", payment, confirm_token);
      if (!g.ok) return fail(g.message!);
      if (g.dryRun) {
        return ok(
          { dry_run: true, would_create: { ClientPayment: payment } },
          "🧪 [Dry-Run] سيتم تسجيل دفعة:"
        );
      }

      const response = await client.post("/client_payments", {
        ClientPayment: payment,
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