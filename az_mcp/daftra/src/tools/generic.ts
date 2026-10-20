import { createDaftraClient } from '../client.js';

export const genericTools = [
  {
    name: 'daftra_custom_api_request',
    description: 'Execute any custom HTTP request to Daftra API (GET, POST, PUT, DELETE). Use this for any endpoint not covered by specific tools.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP Method'
        },
        endpoint: {
          type: 'string',
          description: 'API endpoint path (e.g. /invoices.json, /clients.json, /staff.json)'
        },
        params: {
          type: 'object',
          description: 'URL query parameters (for GET requests, e.g. { page: 1, limit: 10 })'
        },
        data: {
          type: 'object',
          description: 'Request payload body (for POST/PUT requests)'
        }
      },
      required: ['method', 'endpoint']
    }
  }
];

export async function handleGenericTool(name: string, args: any) {
  const daftraClient = createDaftraClient();

  if (name === 'daftra_custom_api_request') {
    const { method, endpoint, params, data } = args;
    
    // ضمان بدء المسار بـ /
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    const response = await daftraClient.request({
      method,
      url: formattedEndpoint,
      params,
      data
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown generic tool: ${name}`);
}
