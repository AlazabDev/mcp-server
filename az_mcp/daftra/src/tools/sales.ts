import { createDaftraClient } from '../client.js';

export const salesTools = [
  {
    name: 'daftra_list_invoices',
    description: 'Get list of invoices with pagination and filters',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number' },
        limit: { type: 'number', description: 'Number of items per page' },
        client_id: { type: 'number', description: 'Filter by Client ID' },
        status: { type: 'string', description: 'Filter by invoice status' }
      }
    }
  },
  {
    name: 'daftra_create_invoice',
    description: 'Create a new invoice in Daftra',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'number', description: 'Client ID (Required)' },
        invoice_items: {
          type: 'array',
          description: 'Array of invoice items',
          items: {
            type: 'object',
            properties: {
              item_title: { type: 'string' },
              unit_price: { type: 'number' },
              quantity: { type: 'number' }
            },
            required: ['item_title', 'unit_price', 'quantity']
          }
        },
        notes: { type: 'string' }
      },
      required: ['client_id']
    }
  },
  {
    name: 'daftra_list_clients',
    description: 'Fetch list of clients/customers from Daftra',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number' },
        limit: { type: 'number' }
      }
    }
  }
];

export async function handleSalesTool(name: string, args: any) {
  const daftraClient = createDaftraClient();

  if (name === 'daftra_list_invoices') {
    const response = await daftraClient.get('/invoices.json', { params: args });
    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  if (name === 'daftra_create_invoice') {
    const response = await daftraClient.post('/invoices.json', { Invoice: args });
    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  if (name === 'daftra_list_clients') {
    const response = await daftraClient.get('/clients.json', { params: args });
    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  throw new Error(`Unknown sales tool: ${name}`);
}
