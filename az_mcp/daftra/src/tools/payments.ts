import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../client.js";

export function registerPaymentTools(server: McpServer, client: DaftraClient) {
  server.tool(
    "get_invoice_payments",
    "الحصول على قائمة مدفوعات الفواتير",
    {
      page: z.number().optional(),
      limit: z.number().optional(),
      invoice_id: z.number().optional(),
      client_id: z.number().optional(),
      payment_method: z.string().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
    },
    async (params) => {
      const response = await client.get("/invoice_payments.json", params);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "create_invoice_payment",
    "تسجيل دفعة على فاتورة",
    {
      invoice_id: z.number().describe("معرف الفاتورة (مطلوب)"),
      amount: z.number().describe("مبلغ الدفعة (مطلوب)"),
      payment_method: z.string().describe("طريقة الدفع: cash, bank, cheque (مطلوب)"),
      date: z.string().optional().describe("تاريخ الدفعة"),
      transaction_id: z.string().optional(),
      treasury_id: z.number().optional(),
    },
    async (params) => {
      const response = await client.post("/invoice_payments.json", {
        InvoicePayment: params,
      });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "get_client_payments",
    "الحصول على مدفوعات العملاء",
    {
      page: z.number().optional(),
      limit: z.number().optional(),
      client_id: z.number().optional(),
    },
    async (params) => {
      const response = await client.get("/client_payments.json", params);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "create_client_payment",
    "تسجيل دفعة لعميل",
    {
      client_id: z.number().describe("معرف العميل (مطلوب)"),
      amount: z.number().describe("المبلغ (مطلوب)"),
      payment_method: z.string().describe("طريقة الدفع (مطلوب)"),
      date: z.string().optional(),
      notes: z.string().optional(),
    },
    async (params) => {
      const response = await client.post("/client_payments.json", {
        ClientPayment: params,
      });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );
}