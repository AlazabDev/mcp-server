import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../client.js";

export function registerInvoiceTools(server: McpServer, client: DaftraClient) {
  // Get all invoices
  server.tool(
    "get_invoices",
    "الحصول على قائمة الفواتير مع إمكانية الفلترة",
    {
      page: z.number().optional().describe("رقم الصفحة"),
      limit: z.number().optional().describe("عدد الفواتير في الصفحة"),
      date_from: z.string().optional().describe("تاريخ البداية YYYY-MM-DD"),
      date_to: z.string().optional().describe("تاريخ النهاية YYYY-MM-DD"),
      client_id: z.number().optional().describe("معرف العميل"),
      payment_status: z.number().optional().describe("حالة الدفع"),
      currency_code: z.string().optional().describe("رمز العملة"),
      keywords: z.string().optional().describe("كلمات البحث"),
    },
    async (params) => {
      const response = await client.get("/invoices.json", params);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  // Get single invoice
  server.tool(
    "get_invoice",
    "الحصول على تفاصيل فاتورة واحدة",
    {
      id: z.number().describe("معرف الفاتورة"),
    },
    async ({ id }) => {
      const response = await client.get(`/invoices/${id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  // Create invoice
  server.tool(
    "create_invoice",
    "إنشاء فاتورة جديدة",
    {
      client_id: z.number().describe("معرف العميل (مطلوب)"),
      date: z.string().optional().describe("تاريخ الفاتورة YYYY-MM-DD"),
      currency_code: z.string().optional().describe("رمز العملة"),
      notes: z.string().optional().describe("ملاحظات"),
      discount: z.number().optional().describe("نسبة الخصم"),
      discount_amount: z.number().optional().describe("مبلغ الخصم"),
      items: z.array(z.object({
        item: z.string().optional().describe("اسم البند"),
        description: z.string().optional().describe("وصف البند"),
        unit_price: z.number().describe("سعر الوحدة"),
        quantity: z.number().describe("الكمية"),
        product_id: z.number().optional().describe("معرف المنتج"),
        tax1: z.number().optional().describe("معرف الضريبة"),
        discount: z.number().optional().describe("خصم البند"),
        discount_type: z.number().optional().describe("نوع الخصم 1=نسبة 2=قيمة"),
      })).optional().describe("بنود الفاتورة"),
    },
    async (params) => {
      const body = {
        Invoice: {
          client_id: params.client_id,
          date: params.date,
          currency_code: params.currency_code,
          notes: params.notes,
          discount: params.discount || 0,
          discount_amount: params.discount_amount || 0,
        },
        InvoiceItem: params.items || [],
      };
      const response = await client.post("/invoices.json", body);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  // Update invoice
  server.tool(
    "update_invoice",
    "تعديل فاتورة موجودة",
    {
      id: z.number().describe("معرف الفاتورة"),
      client_id: z.number().describe("معرف العميل"),
      date: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        item: z.string().optional(),
        unit_price: z.number(),
        quantity: z.number(),
        product_id: z.number().optional(),
      })).optional(),
    },
    async ({ id, ...params }) => {
      const body = {
        Invoice: {
          client_id: params.client_id,
          date: params.date,
          notes: params.notes,
        },
        InvoiceItem: params.items || [],
      };
      const response = await client.put(`/invoices/${id}.json`, body);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  // Delete invoice
  server.tool(
    "delete_invoice",
    "حذف فاتورة",
    {
      id: z.number().describe("معرف الفاتورة"),
    },
    async ({ id }) => {
      const response = await client.delete(`/invoices/${id}.json`);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
  );
}