const BASE = "/api";

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Invoice types (mirrors backend response shapes) ─────────────────────────

export interface InvoiceRow {
  id: string;
  fileName: string;
  fileType: string;
  filePath: string;
  fileSize: number | null;
  status: string;
  vendorId: string | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: string | null;
  taxAmount: string | null;
  discountAmount: string | null;
  totalAmount: string | null;
  overallConfidence: number | null;
  fieldConfidences: Record<string, number> | null;
  rawExtraction: Record<string, unknown> | null;
  extractionModel: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LineItemRow {
  id: string;
  invoiceId: string;
  lineNumber: number | null;
  description: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  category: string | null;
  sku: string | null;
  unit: string | null;
  confidence: number | null;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceRow {
  lineItems: LineItemRow[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface VendorRow {
  id: string;
  name: string;
  totalInvoices: number;
  totalSpend: string;
  averageInvoiceAmount: string | null;
}

// ─── API functions ───────────────────────────────────────────────────────────

export function fetchInvoices(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<PaginatedResponse<InvoiceRow>>(`/invoices${qs}`);
}

export function fetchInvoice(id: string) {
  return request<InvoiceDetail>(`/invoices/${id}`);
}

export function uploadInvoice(file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetch(`${BASE}/invoices/upload`, {
    method: "POST",
    credentials: "include",
    body: form,
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Upload failed");
    }
    return res.json() as Promise<{ id: string; status: string; fileName: string }>;
  });
}

export function triggerExtraction(id: string) {
  return request<{ id: string; status: string }>(`/invoices/${id}/extract`, {
    method: "POST",
  });
}

export function updateInvoice(id: string, data: Record<string, unknown>) {
  return request<InvoiceRow>(`/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function approveInvoice(id: string) {
  return request<InvoiceRow>(`/invoices/${id}/approve`, { method: "POST" });
}

export function rejectInvoice(id: string, reviewNotes?: string) {
  return request<InvoiceRow>(`/invoices/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reviewNotes }),
  });
}

export function deleteInvoice(id: string) {
  return request<{ message: string; id: string }>(`/invoices/${id}`, {
    method: "DELETE",
  });
}

export function fetchVendors() {
  return request<VendorRow[]>("/vendors");
}
