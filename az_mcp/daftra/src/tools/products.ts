import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DaftraClient } from "../client.js";

export function registerProductTools(server: McpServer, client: DaftraClient) {
  server.tool(
    "get_products",
    "الحصول على قائمة المنتجات",
    {
      keywords: z.string().optional(),
      category: z.number().optional(),
      status: z.number().optional(),
      barcode: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
    },
    async (params) => {
      const response = await client.get("/products.json", params);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "get_product",
    "الحصول على تفاصيل منتج",
    { id: z.number() },
    async ({ id }) => {
      const response = await client.get(`/products/${id}.json`);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "create_product",
    "إنشاء منتج جديد",
    {
      name: z.string().describe("اسم المنتج (مطلوب)"),
      type: z.number().optional().describe("1=منتج 2=خدمة 3=حزمة"),
      product_code: z.string().optional(),
      barcode: z.string().optional(),
      unit_price: z.number().optional(),
      buy_price: z.number().optional(),
      description: z.string().optional(),
      track_stock: z.number().optional(),
      initial_stock_level: z.number().optional(),
      store_id: z.number().optional(),
      categories_id: z.array(z.number()).optional(),
      tags: z.string().optional(),
    },
    async (params) => {
      const response = await client.post("/products.json", { Product: params });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "update_product",
    "تعديل منتج",
    {
      id: z.number(),
      name: z.string().optional(),
      unit_price: z.number().optional(),
      buy_price: z.number().optional(),
      status: z.number().optional(),
    },
    async ({ id, ...params }) => {
      const response = await client.put(`/products/${id}.json`, { Product: params });
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );

  server.tool(
    "delete_product",
    "حذف منتج",
    { id: z.number() },
    async ({ id }) => {
      const response = await client.delete(`/products/${id}.json`);
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );
}