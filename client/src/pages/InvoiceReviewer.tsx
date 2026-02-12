import { useCallback, useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm, useFieldArray } from "react-hook-form";
import {
  useInvoice,
  useUpdateInvoice,
  useApproveInvoice,
  useRejectInvoice,
  useRetryExtraction,
} from "@/hooks/useInvoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  X,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertTriangle,
  Save,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReviewFormValues {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  reviewNotes: string;
  lineItems: {
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    category: string;
  }[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvoiceReviewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: invoice, isLoading, isError } = useInvoice(id);

  const updateMutation = useUpdateInvoice();
  const approveMutation = useApproveInvoice();
  const rejectMutation = useRejectInvoice();
  const retryMutation = useRetryExtraction();

  const form = useForm<ReviewFormValues>();
  const { fields } = useFieldArray({ control: form.control, name: "lineItems" });

  // Populate form when invoice data arrives
  useEffect(() => {
    if (!invoice || invoice.status === "processing") return;
    form.reset({
      vendorName: invoice.vendorName ?? "",
      invoiceNumber: invoice.invoiceNumber ?? "",
      invoiceDate: invoice.invoiceDate
        ? invoice.invoiceDate.slice(0, 10)
        : "",
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : "",
      currency: invoice.currency ?? "USD",
      subtotal: invoice.subtotal ?? "",
      taxAmount: invoice.taxAmount ?? "",
      discountAmount: invoice.discountAmount ?? "",
      totalAmount: invoice.totalAmount ?? "",
      reviewNotes: invoice.reviewNotes ?? "",
      lineItems: (invoice.lineItems ?? []).map((li) => ({
        description: li.description ?? "",
        quantity: li.quantity ?? "",
        unitPrice: li.unitPrice ?? "",
        amount: li.amount ?? "",
        category: li.category ?? "",
      })),
    });
  }, [invoice, form]);

  const onSave = useCallback(
    (values: ReviewFormValues) => {
      if (!id) return;
      updateMutation.mutate({
        id,
        data: {
          vendorName: values.vendorName,
          invoiceNumber: values.invoiceNumber,
          invoiceDate: values.invoiceDate || undefined,
          dueDate: values.dueDate || undefined,
          currency: values.currency,
          subtotal: values.subtotal ? Number(values.subtotal) : undefined,
          taxAmount: values.taxAmount ? Number(values.taxAmount) : undefined,
          discountAmount: values.discountAmount
            ? Number(values.discountAmount)
            : undefined,
          totalAmount: values.totalAmount
            ? Number(values.totalAmount)
            : undefined,
          reviewNotes: values.reviewNotes || undefined,
        },
      });
    },
    [id, updateMutation]
  );

  // ─── Loading / error states ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-10 w-10" />
        <p>Invoice not found or failed to load.</p>
        <Button variant="outline" onClick={() => navigate("/invoices")}>
          Back to Invoices
        </Button>
      </div>
    );
  }

  // Processing state
  if (invoice.status === "processing") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg font-medium">Extracting invoice data...</p>
        <p className="text-sm text-muted-foreground">
          AI is analyzing your invoice. This usually takes 10–30 seconds.
        </p>
      </div>
    );
  }

  const confidences = (invoice.fieldConfidences ?? {}) as Record<string, number>;

  return (
    <div className="flex h-full flex-col">
      {/* ─── Top Bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">
              {invoice.vendorName || invoice.fileName}
            </h1>
            <p className="text-xs text-muted-foreground">
              {invoice.invoiceNumber || "No invoice number"}
            </p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>
        <div className="flex items-center gap-2">
          {invoice.status === "failed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => id && retryMutation.mutate(id)}
              disabled={retryMutation.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          )}
          {(invoice.status === "review" || invoice.status === "extracted") && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={form.handleSubmit(onSave)}
                disabled={updateMutation.isPending}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  id && rejectMutation.mutate({ id, notes: form.getValues("reviewNotes") })
                }
                disabled={rejectMutation.isPending}
              >
                <X className="h-4 w-4" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => id && approveMutation.mutate(id)}
                disabled={approveMutation.isPending}
              >
                <Check className="h-4 w-4" />
                Approve
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── Two-Panel Layout ──────────────────────────────────────────── */}
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left: Zoomable Image */}
        <Panel defaultSize={50} minSize={30}>
          <ImageViewer filePath={invoice.filePath} fileName={invoice.fileName} />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors" />

        {/* Right: Editable Form */}
        <Panel defaultSize={50} minSize={30}>
          <ScrollArea className="h-full">
            <form
              onSubmit={form.handleSubmit(onSave)}
              className="space-y-6 p-6"
            >
              <Tabs defaultValue="details">
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="lineItems">
                    Line Items ({invoice.lineItems?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="raw">Raw Data</TabsTrigger>
                </TabsList>

                {/* ── Details Tab ──────────────────────────────────────── */}
                <TabsContent value="details" className="space-y-6">
                  {/* Header Info */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Header Info
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ConfidenceField
                        label="Vendor Name"
                        confidence={confidences.vendorName}
                      >
                        <Input {...form.register("vendorName")} />
                      </ConfidenceField>
                      <ConfidenceField
                        label="Invoice Number"
                        confidence={confidences.invoiceNumber}
                      >
                        <Input {...form.register("invoiceNumber")} />
                      </ConfidenceField>
                      <ConfidenceField
                        label="Invoice Date"
                        confidence={confidences.invoiceDate}
                      >
                        <Input type="date" {...form.register("invoiceDate")} />
                      </ConfidenceField>
                      <ConfidenceField
                        label="Due Date"
                        confidence={confidences.dueDate}
                      >
                        <Input type="date" {...form.register("dueDate")} />
                      </ConfidenceField>
                      <ConfidenceField label="Currency">
                        <Input {...form.register("currency")} maxLength={3} />
                      </ConfidenceField>
                    </div>
                  </section>

                  <Separator />

                  {/* Totals */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Totals
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ConfidenceField
                        label="Subtotal"
                        confidence={confidences.subtotal}
                      >
                        <Input type="number" step="0.01" {...form.register("subtotal")} />
                      </ConfidenceField>
                      <ConfidenceField
                        label="Tax Amount"
                        confidence={confidences.taxAmount}
                      >
                        <Input type="number" step="0.01" {...form.register("taxAmount")} />
                      </ConfidenceField>
                      <ConfidenceField label="Discount Amount">
                        <Input type="number" step="0.01" {...form.register("discountAmount")} />
                      </ConfidenceField>
                      <ConfidenceField
                        label="Total Amount"
                        confidence={confidences.totalAmount}
                      >
                        <Input
                          type="number"
                          step="0.01"
                          {...form.register("totalAmount")}
                          className="font-semibold"
                        />
                      </ConfidenceField>
                    </div>
                  </section>

                  <Separator />

                  {/* Confidence Overview */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      AI Confidence
                    </h3>
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold">
                        {invoice.overallConfidence != null
                          ? `${Math.round(invoice.overallConfidence * 100)}%`
                          : "—"}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        overall confidence
                      </span>
                    </div>
                    {Object.keys(confidences).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(confidences).map(([key, val]) => (
                          <Badge
                            key={key}
                            variant="outline"
                            className={cn(
                              val < 0.5
                                ? "border-red-300 text-red-700"
                                : val < 0.8
                                  ? "border-amber-300 text-amber-700"
                                  : "border-emerald-300 text-emerald-700"
                            )}
                          >
                            {key}: {Math.round(val * 100)}%
                          </Badge>
                        ))}
                      </div>
                    )}
                  </section>

                  <Separator />

                  {/* Review Notes */}
                  <section className="space-y-2">
                    <Label htmlFor="reviewNotes">Review Notes</Label>
                    <textarea
                      id="reviewNotes"
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Add notes about this invoice..."
                      {...form.register("reviewNotes")}
                    />
                  </section>
                </TabsContent>

                {/* ── Line Items Tab ───────────────────────────────────── */}
                <TabsContent value="lineItems" className="space-y-4">
                  {fields.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No line items extracted.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {fields.map((field, index) => {
                        const itemConfidence =
                          invoice.lineItems?.[index]?.confidence as
                            | number
                            | null
                            | undefined;
                        const isLowConfidence =
                          itemConfidence != null && itemConfidence < 0.8;

                        return (
                          <Card
                            key={field.id}
                            className={cn(
                              "overflow-hidden",
                              isLowConfidence &&
                                "ring-2 ring-amber-300/60 ring-offset-1"
                            )}
                          >
                            <CardContent className="p-4">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    Line {index + 1}
                                  </span>
                                  {isLowConfidence && (
                                    <span className="text-xs text-amber-600">
                                      ({Math.round(itemConfidence! * 100)}%)
                                    </span>
                                  )}
                                </div>
                                {invoice.lineItems?.[index]?.category && (
                                  <Badge variant="secondary" className="text-xs">
                                    {invoice.lineItems[index].category}
                                  </Badge>
                                )}
                              </div>
                              <div className="grid gap-3 sm:grid-cols-4">
                                <div className="sm:col-span-2">
                                  <Label className="text-xs">Description</Label>
                                  <Input
                                    {...form.register(`lineItems.${index}.description`)}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Qty</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...form.register(`lineItems.${index}.quantity`)}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Unit Price</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...form.register(`lineItems.${index}.unitPrice`)}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Amount</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...form.register(`lineItems.${index}.amount`)}
                                    className="mt-1 font-mono"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Category</Label>
                                  <Input
                                    {...form.register(`lineItems.${index}.category`)}
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ── Raw Data Tab ─────────────────────────────────────── */}
                <TabsContent value="raw">
                  <pre className="max-h-[600px] overflow-auto rounded-md bg-muted p-4 text-xs">
                    {JSON.stringify(invoice.rawExtraction, null, 2) ?? "No raw data"}
                  </pre>
                </TabsContent>
              </Tabs>
            </form>
          </ScrollArea>
        </Panel>
      </PanelGroup>
    </div>
  );
}

// ─── ConfidenceField: wraps a form field with yellow glow if confidence < 0.8 ─

function ConfidenceField({
  label,
  confidence,
  children,
}: {
  label: string;
  confidence?: number;
  children: React.ReactNode;
}) {
  const isLow = confidence != null && confidence < 0.8;

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-2">
        {label}
        {isLow && (
          <span
            className="text-xs text-amber-600"
            title={`Confidence: ${Math.round((confidence ?? 0) * 100)}%`}
          >
            ({Math.round((confidence ?? 0) * 100)}%)
          </span>
        )}
      </Label>
      <div
        className={cn(
          "rounded-md",
          isLow && "ring-2 ring-amber-300/60 ring-offset-1"
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ─── ImageViewer: zoomable/pannable invoice image ────────────────────────────

function ImageViewer({ filePath, fileName }: { filePath: string; fileName: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Construct image URL — the server serves uploads at /uploads/invoices/<filename>
  const imageSrc = `/uploads/invoices/${filePath.split(/[\\/]/).pop()}`;

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(Math.max(z - e.deltaY * 0.001, 0.25), 4));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setPan((p) => ({
        x: p.x + e.clientX - lastPos.current.x,
        y: p.y + e.clientY - lastPos.current.y,
      }));
      lastPos.current = { x: e.clientX, y: e.clientY };
    },
    [dragging]
  );

  const onMouseUp = useCallback(() => setDragging(false), []);

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Zoom controls */}
      <div className="flex items-center gap-1 border-b bg-card px-3 py-2">
        <Button variant="ghost" size="icon" onClick={zoomOut} className="h-7 w-7">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="w-14 text-center text-xs tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" onClick={zoomIn} className="h-7 w-7">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={resetZoom} className="ml-1 h-7 text-xs">
          Reset
        </Button>
        <span className="ml-auto text-xs text-muted-foreground truncate max-w-48">
          {fileName}
        </span>
      </div>

      {/* Image canvas */}
      <div
        ref={containerRef}
        className="flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          <img
            src={imageSrc}
            alt={fileName}
            className="max-h-full max-w-full object-contain select-none"
            draggable={false}
            onError={(e) => {
              // If image fails to load, show a placeholder
              (e.target as HTMLImageElement).style.display = "none";
              const p = (e.target as HTMLImageElement).parentElement;
              if (p && !p.querySelector(".img-fallback")) {
                const div = document.createElement("div");
                div.className = "img-fallback flex flex-col items-center gap-2 text-muted-foreground";
                div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg><span class="text-sm">Preview not available</span>`;
                p.appendChild(div);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
