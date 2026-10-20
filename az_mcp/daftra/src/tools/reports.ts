import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../client.js";

export function registerReportTools(server: McpServer, client: DaftraClient) {
  const reportParams = {
    date_from: z.string().optional().describe("تاريخ البداية YYYY-MM-DD"),
    date_to: z.string().optional().describe("تاريخ النهاية YYYY-MM-DD"),
    currency: z.string().optional().describe("-1 للتحويل إلى العملة الأساسية"),
    group_by: z.string().optional(),
    client_id: z.number().optional(),
    branch_id: z.array(z.number()).optional(),
  };

  server.tool(
    "report_sales_revenue",
    "تقرير إيرادات المبيعات",
    {
      report_type: z.enum(["invoice", "period", "client", "staff", "sales_person"])
        .describe("نوع التقرير: invoice=تفصيلي, period=حسب الفترة, client=حسب العميل, staff=حسب الموظف"),
      group_by: z.enum(["daily", "weekly", "monthly", "yearly", "client", "staff", "sales_person", "lastyear", "lastmonth"]).optional(),
      ...reportParams,
    },
    async (params) => {
      const response = await client.get("/reports/revenue", params);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "report_product_sales",
    "تقرير مبيعات المنتجات",
    {
      group_by: z.enum(["daily", "weekly", "monthly", "yearly", "product", "category", "brand", "staff", "sales_person", "client", "collected_by"]).optional(),
      is_summary: z.number().optional().describe("0=تفصيلي مع بنود 1=ملخص"),
      ...reportParams,
    },
    async (params) => {
      const response = await client.get("/reports/products", params);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "report_payments",
    "تقرير الدفعات",
    {
      group_by: z.enum(["daily", "weekly", "monthly", "yearly", "client", "staff", "collected_by", "payment_method"]).optional(),
      is_summary: z.number().optional(),
      payment_method: z.string().optional(),
      ...reportParams,
    },
    async (params) => {
      const response = await client.get("/reports/payments", params);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "report_profit_loss_accrual",
    "تقرير الأرباح والخسائر (على أساس الاستحقاق)",
    {
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      group_by_date: z.enum(["monthly", "quarterly", "annually"]).optional(),
      max_level: z.number().min(1).max(7).optional(),
      cost_center_id: z.array(z.number()).optional(),
    },
    async (params) => {
      const response = await client.get("/reports/accounts_profit_accrual", params);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );
}