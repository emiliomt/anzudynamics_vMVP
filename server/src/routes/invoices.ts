import { Router } from "express";
import { eq, desc, sql, and, gte, lte, or, ilike } from "drizzle-orm";
import { db } from "../db.js";
import {
  invoices,
  lineItems,
  vendors,
  invoiceFilterSchema,
} from "@invoice-ai/shared";
import { upload } from "../middleware/upload.js";
import { processFile } from "../services/imageProcessor.js";
import { extractInvoiceData } from "../services/aiExtractor.js";

export const invoiceRouter = Router();

// ─── POST /upload ─────────────────────────────────────────────────────────────
// Accepts a file, persists it to disk, creates a DB record with status
// "processing", then kicks off AI extraction asynchronously.
invoiceRouter.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const isPdf = file.mimetype === "application/pdf";
    const fileType = isPdf ? "pdf" : "image";

    // Create the invoice record in a transaction
    const [invoice] = await db
      .insert(invoices)
      .values({
        fileName: file.originalname,
        fileType,
        filePath: file.path,
        fileSize: file.size,
        status: "processing",
      })
      .returning();

    // Respond immediately — extraction happens in the background
    res.status(201).json({
      id: invoice.id,
      status: invoice.status,
      fileName: invoice.fileName,
      message: "File uploaded. Extraction in progress.",
    });

    // ── Async extraction pipeline ────────────────────────────────────────
    runExtraction(invoice.id, file.path).catch((err) => {
      console.error(`[extraction] fatal error for invoice ${invoice.id}:`, err);
    });
  } catch (err) {
    console.error("[upload] error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ─── POST /:id/extract ───────────────────────────────────────────────────────
// Manually trigger (or re-trigger) extraction on an existing invoice.
invoiceRouter.post("/:id/extract", async (req, res) => {
  try {
    const { id } = req.params;

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    // Mark as processing
    await db
      .update(invoices)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(invoices.id, id));

    res.json({ id, status: "processing", message: "Extraction started." });

    runExtraction(id, invoice.filePath).catch((err) => {
      console.error(`[extraction] fatal error for invoice ${id}:`, err);
    });
  } catch (err) {
    console.error("[extract] error:", err);
    res.status(500).json({ error: "Extraction trigger failed" });
  }
});

// ─── GET / ────────────────────────────────────────────────────────────────────
// List invoices with optional filters and pagination.
invoiceRouter.get("/", async (req, res) => {
  try {
    const query = invoiceFilterSchema.parse({
      status: req.query.status,
      vendorId: req.query.vendorId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      minAmount: req.query.minAmount ? Number(req.query.minAmount) : undefined,
      maxAmount: req.query.maxAmount ? Number(req.query.maxAmount) : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });

    const conditions = [];
    if (query.status) conditions.push(eq(invoices.status, query.status));
    if (query.vendorId) conditions.push(eq(invoices.vendorId, query.vendorId));
    if (query.dateFrom)
      conditions.push(gte(invoices.createdAt, new Date(query.dateFrom)));
    if (query.dateTo)
      conditions.push(lte(invoices.createdAt, new Date(query.dateTo)));
    if (query.minAmount != null)
      conditions.push(gte(invoices.totalAmount, String(query.minAmount)));
    if (query.maxAmount != null)
      conditions.push(lte(invoices.totalAmount, String(query.maxAmount)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.limit;

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(invoices)
        .where(where)
        .orderBy(desc(invoices.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(where),
    ]);

    res.json({
      data: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: count,
        pages: Math.ceil(count / query.limit),
      },
    });
  } catch (err) {
    console.error("[list] error:", err);
    res.status(500).json({ error: "Failed to list invoices" });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Get a single invoice with its line items.
invoiceRouter.get("/:id", async (req, res) => {
  try {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, req.params.id))
      .limit(1);

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const items = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoice.id))
      .orderBy(lineItems.lineNumber);

    res.json({ ...invoice, lineItems: items });
  } catch (err) {
    console.error("[get] error:", err);
    res.status(500).json({ error: "Failed to get invoice" });
  }
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────
// Update extracted fields after human review.
invoiceRouter.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      vendorName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency,
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount,
      reviewNotes,
    } = req.body;

    // If user changed vendor name, store the original AI name as an alias
    if (vendorName !== undefined) {
      const [currentInvoice] = await db
        .select({ vendorId: invoices.vendorId, vendorName: invoices.vendorName })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);

      if (
        currentInvoice?.vendorId &&
        currentInvoice.vendorName &&
        currentInvoice.vendorName !== vendorName
      ) {
        const [vendor] = await db
          .select()
          .from(vendors)
          .where(eq(vendors.id, currentInvoice.vendorId))
          .limit(1);

        if (vendor) {
          const currentAliases: string[] = (vendor.aliases as string[]) ?? [];
          // Store the old AI name as alias if not already present
          const oldName = currentInvoice.vendorName;
          const updatedAliases = currentAliases.includes(oldName)
            ? currentAliases
            : [...currentAliases, oldName];
          await db
            .update(vendors)
            .set({
              name: vendorName,
              normalizedName: vendorName.trim().toLowerCase(),
              aliases: updatedAliases,
              updatedAt: new Date(),
            })
            .where(eq(vendors.id, vendor.id));
        }
      }
    }

    const [updated] = await db
      .update(invoices)
      .set({
        ...(vendorName !== undefined && { vendorName }),
        ...(invoiceNumber !== undefined && { invoiceNumber }),
        ...(invoiceDate !== undefined && {
          invoiceDate: new Date(invoiceDate),
        }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
        ...(currency !== undefined && { currency }),
        ...(subtotal !== undefined && { subtotal: String(subtotal) }),
        ...(taxAmount !== undefined && { taxAmount: String(taxAmount) }),
        ...(discountAmount !== undefined && {
          discountAmount: String(discountAmount),
        }),
        ...(totalAmount !== undefined && { totalAmount: String(totalAmount) }),
        ...(reviewNotes !== undefined && { reviewNotes }),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error("[update] error:", err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

// ─── POST /:id/approve ───────────────────────────────────────────────────────
invoiceRouter.post("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewedBy } = req.body;

    const [updated] = await db
      .update(invoices)
      .set({
        status: "approved",
        reviewedBy: reviewedBy || "system",
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error("[approve] error:", err);
    res.status(500).json({ error: "Failed to approve invoice" });
  }
});

// ─── POST /:id/reject ────────────────────────────────────────────────────────
invoiceRouter.post("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewedBy, reviewNotes } = req.body;

    const [updated] = await db
      .update(invoices)
      .set({
        status: "rejected",
        reviewedBy: reviewedBy || "system",
        reviewedAt: new Date(),
        reviewNotes,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error("[reject] error:", err);
    res.status(500).json({ error: "Failed to reject invoice" });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
invoiceRouter.delete("/:id", async (req, res) => {
  try {
    const [deleted] = await db
      .delete(invoices)
      .where(eq(invoices.id, req.params.id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    res.json({ message: "Invoice deleted", id: deleted.id });
  } catch (err) {
    console.error("[delete] error:", err);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

// ─── Async Extraction Pipeline ───────────────────────────────────────────────

async function runExtraction(invoiceId: string, filePath: string) {
  try {
    console.log(`[extraction] starting for invoice ${invoiceId}`);

    // 1. Preprocess the image
    const processed = await processFile(filePath);
    console.log(
      `[extraction] image preprocessed: ${processed.width}x${processed.height}`
    );

    // 2. Send to Claude Vision
    const result = await extractInvoiceData(processed);
    console.log(
      `[extraction] AI completed. confidence=${result.data.confidence}, model=${result.model}`
    );

    // 3. Fail if confidence is below floor threshold (junk data filter)
    const CONFIDENCE_FLOOR = 0.15;
    if (result.data.confidence < CONFIDENCE_FLOOR) {
      await db
        .update(invoices)
        .set({
          status: "failed",
          overallConfidence: result.data.confidence,
          rawExtraction: result.data as unknown as Record<string, unknown>,
          extractionModel: result.model,
          reviewNotes: "Document type unrecognized or illegible",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));
      console.warn(
        `[extraction] confidence=${result.data.confidence} < ${CONFIDENCE_FLOOR} for invoice ${invoiceId}, marked as failed`
      );
      return;
    }

    // 4. Persist everything in a transaction
    await db.transaction(async (tx) => {
      // Upsert vendor — search by exact name, normalized name, or aliases
      let vendorId: string | null = null;
      if (result.data.vendor.name) {
        const aiVendorName = result.data.vendor.name;
        const normalizedName = aiVendorName.trim().toLowerCase();

        // Search: exact name match, normalized name match, or alias match
        const existingVendors = await tx
          .select()
          .from(vendors)
          .where(
            or(
              eq(vendors.name, aiVendorName),
              eq(vendors.normalizedName, normalizedName),
              sql`${vendors.aliases}::jsonb @> ${JSON.stringify([aiVendorName])}::jsonb`
            )
          )
          .limit(1);

        if (existingVendors.length > 0) {
          const v = existingVendors[0];
          // Ensure the AI name is stored as an alias if not already present
          const currentAliases: string[] = (v.aliases as string[]) ?? [];
          const updatedAliases = currentAliases.includes(aiVendorName)
            ? currentAliases
            : [...currentAliases, aiVendorName];

          await tx
            .update(vendors)
            .set({
              aliases: updatedAliases,
              totalInvoices: (v.totalInvoices || 0) + 1,
              totalSpend: String(
                parseFloat(v.totalSpend || "0") + (result.data.totalAmount || 0)
              ),
              averageInvoiceAmount: String(
                (parseFloat(v.totalSpend || "0") +
                  (result.data.totalAmount || 0)) /
                  ((v.totalInvoices || 0) + 1)
              ),
              lastInvoiceDate: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(vendors.id, v.id));
          vendorId = v.id;
        } else {
          const [newVendor] = await tx
            .insert(vendors)
            .values({
              name: aiVendorName,
              normalizedName,
              aliases: [aiVendorName],
              address: result.data.vendor.address,
              taxId: result.data.vendor.taxId,
              email: result.data.vendor.email,
              phone: result.data.vendor.phone,
              totalInvoices: 1,
              totalSpend: String(result.data.totalAmount || 0),
              averageInvoiceAmount: String(result.data.totalAmount || 0),
              lastInvoiceDate: new Date(),
            })
            .returning();
          vendorId = newVendor.id;
        }
      }

      // Update invoice with extracted data
      await tx
        .update(invoices)
        .set({
          status: "review",
          vendorId,
          vendorName: result.data.vendor.name,
          invoiceNumber: result.data.invoiceNumber,
          invoiceDate: result.data.invoiceDate
            ? new Date(result.data.invoiceDate)
            : null,
          dueDate: result.data.dueDate
            ? new Date(result.data.dueDate)
            : null,
          currency: result.data.currency,
          subtotal: result.data.subtotal != null
            ? String(result.data.subtotal)
            : null,
          taxAmount: result.data.taxAmount != null
            ? String(result.data.taxAmount)
            : null,
          discountAmount: result.data.discountAmount != null
            ? String(result.data.discountAmount)
            : null,
          totalAmount: String(result.data.totalAmount),
          overallConfidence: result.data.confidence,
          fieldConfidences: result.data.fieldConfidences as Record<
            string,
            number
          >,
          rawExtraction: result.data as unknown as Record<string, unknown>,
          extractionModel: result.model,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));

      // Insert line items
      if (result.data.lineItems.length > 0) {
        await tx.insert(lineItems).values(
          result.data.lineItems.map((item, idx) => ({
            invoiceId,
            lineNumber: item.lineNumber ?? idx + 1,
            description: item.description,
            quantity: item.quantity != null ? String(item.quantity) : null,
            unitPrice: item.unitPrice != null ? String(item.unitPrice) : null,
            amount: String(item.amount),
            taxRate: item.taxRate != null ? String(item.taxRate) : null,
            taxAmount: item.taxAmount != null ? String(item.taxAmount) : null,
            category: item.category,
            sku: item.sku,
            unit: item.unit,
            confidence: item.confidence ?? result.data.confidence,
          }))
        );
      }
    });

    console.log(
      `[extraction] completed for invoice ${invoiceId}: ` +
        `${result.data.lineItems.length} line items, ` +
        `total=${result.data.totalAmount}, ` +
        `vendor="${result.data.vendor.name}"`
    );
  } catch (err) {
    console.error(`[extraction] failed for invoice ${invoiceId}:`, err);

    // Mark as failed and store the error
    await db
      .update(invoices)
      .set({
        status: "failed",
        rawExtraction: {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
  }
}
