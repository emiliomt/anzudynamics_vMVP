import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchInvoices,
  fetchInvoice,
  uploadInvoice,
  updateInvoice,
  approveInvoice,
  rejectInvoice,
  deleteInvoice,
  triggerExtraction,
} from "@/lib/api";

// ─── List with auto-polling for "processing" invoices ─────────────────────────

export function useInvoices(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: () => fetchInvoices(params),
    refetchInterval: (query) => {
      // Poll every 3s if any invoice is still processing
      const hasProcessing = query.state.data?.data.some(
        (inv) => inv.status === "processing"
      );
      return hasProcessing ? 3000 : false;
    },
  });
}

// ─── Single invoice with polling while processing ─────────────────────────────

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ["invoice", id],
    queryFn: () => fetchInvoice(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      return query.state.data?.status === "processing" ? 3000 : false;
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUploadInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateInvoice(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["invoice", vars.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useApproveInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: approveInvoice,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useRejectInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      rejectInvoice(id, notes),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["invoice", vars.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useRetryExtraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: triggerExtraction,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
