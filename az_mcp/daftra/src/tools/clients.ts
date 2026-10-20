import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../client.js";

export function registerClientTools(server: McpServer, client: DaftraClient) {
  server.tool(
    "get_clients",
    "الحصول على قائمة العملاء",
    {
      keywords: z.string().optional().describe("بحث بالاسم أو الإيميل أو الهاتف"),
      limit: z.number().optional(),
      page: z.number().optional(),
    },
    async (params) => {
      const response = await client.get("/clients.json", params);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "get_client",
    "الحصول على بيانات عميل واحد",
    { id: z.number().describe("معرف العميل") },
    async ({ id }) => {
      const response = await client.get(`/clients/${id}.json`);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "create_client",
    "إنشاء عميل جديد",
    {
      business_name: z.string().describe("اسم العميل / الشركة (مطلوب)"),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().optional(),
      phone1: z.string().optional(),
      phone2: z.string().optional(),
      address1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional(),
      type: z.number().optional().describe("2=فرد 3=شركة"),
      default_currency_code: z.string().optional(),
      notes: z.string().optional(),
    },
    async (params) => {
      const response = await client.post("/clients.json", { Client: params });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "update_client",
    "تعديل بيانات عميل",
    {
      id: z.number(),
      business_name: z.string().optional(),
      email: z.string().optional(),
      phone1: z.string().optional(),
      phone2: z.string().optional(),
      address1: z.string().optional(),
      city: z.string().optional(),
      country_code: z.string().optional(),
    },
    async ({ id, ...params }) => {
      const response = await client.put(`/clients/${id}.json`, { Client: params });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "delete_client",
    "حذف عميل",
    { id: z.number() },
    async ({ id }) => {
      const response = await client.delete(`/clients/${id}.json`);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );
}