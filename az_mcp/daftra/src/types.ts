export interface DaftraConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
}

export interface ApiResponse<T = any> {
  result: string;
  code: number;
  data?: T;
  pagination?: Pagination;
  message?: string;
}

export interface Pagination {
  prev: string | null;
  next: string | null;
  page: number;
  page_count: number;
  total_results: number;
}

export interface Invoice {
  id?: number;
  client_id: number;
  no?: string;
  date?: string;
  currency_code?: string;
  draft?: boolean;
  discount?: number;
  discount_amount?: number;
  notes?: string;
  type?: number;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  item?: string;
  description?: string;
  unit_price?: number;
  quantity?: number;
  product_id?: number;
  discount?: number;
  discount_type?: number;
  tax1?: number;
  tax2?: number;
}

export interface Client {
  id?: number;
  business_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone1?: string;
  phone2?: string;
  address1?: string;
  city?: string;
  country_code?: string;
  type?: number;
  default_currency_code?: string;
}

export interface Product {
  id?: number;
  name: string;
  product_code?: string;
  type?: number;
  unit_price?: number;
  buy_price?: number;
  quantity?: number;
  track_stock?: number;
  description?: string;
}

export interface Payment {
  id?: number;
  invoice_id: number;
  amount: number;
  payment_method: string;
  date?: string;
  transaction_id?: string;
  treasury_id?: number;
}

export interface ReportParams {
  date_from?: string;
  date_to?: string;
  group_by?: string;
  currency?: string;
  client_id?: number;
  staff_id?: number[];
  branch_id?: number[];
  is_summary?: number;
}