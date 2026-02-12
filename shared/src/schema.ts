import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "uploading",
  "uploaded",
  "processing",
  "extracted",
  "review",
  "approved",
  "rejected",
  "failed",
]);

export const confidenceLevelEnum = pgEnum("confidence_level", [
  "high",
  "medium",
  "low",
]);

// ─── Vendors Table ────────────────────────────────────────────────────────────

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 255 }),
    aliases: jsonb("aliases").$type<string[]>().default([]),
    taxId: varchar("tax_id", { length: 64 }),
    address: text("address"),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    website: varchar("website", { length: 512 }),
    totalInvoices: integer("total_invoices").default(0).notNull(),
    totalSpend: numeric("total_spend", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    averageInvoiceAmount: numeric("average_invoice_amount", {
      precision: 14,
      scale: 2,
    }).default("0"),
    lastInvoiceDate: timestamp("last_invoice_date"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("vendors_name_idx").on(table.name),
    index("vendors_normalized_name_idx").on(table.normalizedName),
    index("vendors_tax_id_idx").on(table.taxId),
  ]
);

// ─── Invoices Table ───────────────────────────────────────────────────────────

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // File metadata
    fileName: varchar("file_name", { length: 512 }).notNull(),
    fileType: varchar("file_type", { length: 16 }).notNull(), // "pdf" | "image"
    filePath: text("file_path").notNull(),
    fileSize: integer("file_size"), // bytes
    // Processing status
    status: invoiceStatusEnum("status").default("uploading").notNull(),
    // Vendor link
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    // Extracted fields
    vendorName: varchar("vendor_name", { length: 255 }),
    invoiceNumber: varchar("invoice_number", { length: 128 }),
    invoiceDate: timestamp("invoice_date"),
    dueDate: timestamp("due_date"),
    currency: varchar("currency", { length: 8 }).default("USD"),
    // Totals
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 }),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    // AI confidence
    overallConfidence: real("overall_confidence"), // 0.0 – 1.0
    fieldConfidences: jsonb("field_confidences").$type<
      Record<string, number>
    >(),
    // Raw AI output
    rawExtraction: jsonb("raw_extraction").$type<Record<string, unknown>>(),
    extractionModel: varchar("extraction_model", { length: 64 }),
    // Review
    reviewedBy: varchar("reviewed_by", { length: 255 }),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("invoices_status_idx").on(table.status),
    index("invoices_vendor_id_idx").on(table.vendorId),
    index("invoices_invoice_number_idx").on(table.invoiceNumber),
    index("invoices_created_at_idx").on(table.createdAt),
  ]
);

// ─── Line Items Table ─────────────────────────────────────────────────────────

export const lineItems = pgTable(
  "line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .references(() => invoices.id, { onDelete: "cascade" })
      .notNull(),
    lineNumber: integer("line_number"),
    description: text("description"),
    quantity: numeric("quantity", { precision: 12, scale: 4 }),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    taxRate: numeric("tax_rate", { precision: 6, scale: 4 }),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }),
    category: varchar("category", { length: 128 }),
    sku: varchar("sku", { length: 64 }),
    unit: varchar("unit", { length: 32 }),
    confidence: real("confidence"), // 0.0 – 1.0
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("line_items_invoice_id_idx").on(table.invoiceId)]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const vendorsRelations = relations(vendors, ({ many }) => ({
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [invoices.vendorId],
    references: [vendors.id],
  }),
  lineItems: many(lineItems),
}));

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [lineItems.invoiceId],
    references: [invoices.id],
  }),
}));

// ─── Zod Schemas (drizzle-zod) ────────────────────────────────────────────────

// Vendors
export const insertVendorSchema = createInsertSchema(vendors, {
  name: (schema) => schema.min(1, "Vendor name is required"),
  email: (schema) => schema.email("Invalid email address").optional(),
  website: (schema) => schema.url("Invalid URL").optional(),
});
export const selectVendorSchema = createSelectSchema(vendors);
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = z.infer<typeof selectVendorSchema>;

// Invoices
export const insertInvoiceSchema = createInsertSchema(invoices, {
  fileName: (schema) => schema.min(1, "File name is required"),
  fileType: (schema) =>
    schema.refine((v) => ["pdf", "image"].includes(v), "Must be pdf or image"),
  filePath: (schema) => schema.min(1, "File path is required"),
  currency: (schema) => schema.length(3, "Currency must be a 3-letter code"),
  overallConfidence: (schema) =>
    schema.min(0).max(1, "Confidence must be between 0 and 1").optional(),
});
export const selectInvoiceSchema = createSelectSchema(invoices);
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = z.infer<typeof selectInvoiceSchema>;

// Line Items
export const insertLineItemSchema = createInsertSchema(lineItems, {
  invoiceId: (schema) => schema.uuid("Must be a valid invoice ID"),
  confidence: (schema) =>
    schema.min(0).max(1, "Confidence must be between 0 and 1").optional(),
});
export const selectLineItemSchema = createSelectSchema(lineItems);
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;
export type LineItem = z.infer<typeof selectLineItemSchema>;

// ─── API Request/Response Schemas ─────────────────────────────────────────────

export const extractionResultSchema = z.object({
  vendor: z.object({
    name: z.string(),
    address: z.string().optional(),
    taxId: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  currency: z.string().default("USD"),
  subtotal: z.number().optional(),
  taxAmount: z.number().optional(),
  discountAmount: z.number().optional(),
  totalAmount: z.number(),
  lineItems: z.array(
    z.object({
      lineNumber: z.number().optional(),
      description: z.string(),
      quantity: z.number().optional(),
      unitPrice: z.number().optional(),
      amount: z.number(),
      taxRate: z.number().optional(),
      taxAmount: z.number().optional(),
      category: z.string().optional(),
      sku: z.string().optional(),
      unit: z.string().optional(),
    })
  ),
  confidence: z.number().min(0).max(1),
  fieldConfidences: z.record(z.string(), z.number()).optional(),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const invoiceFilterSchema = z.object({
  status: z.enum(invoiceStatusEnum.enumValues).optional(),
  vendorId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export type InvoiceFilter = z.infer<typeof invoiceFilterSchema>;
