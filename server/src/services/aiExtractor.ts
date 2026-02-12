import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { type ExtractionResult } from "@invoice-ai/shared";
import type { ProcessedImage } from "./imageProcessor.js";

// ─── Zod schema for Claude's structured output ───────────────────────────────
// We define this separately from the shared extractionResultSchema because
// the structured-output schema needs additionalProperties:false at every level,
// which zodOutputFormat handles automatically.

const aiExtractionSchema = z.object({
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
  currency: z.string(),
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
      confidence: z.number().optional(),
    })
  ),
  confidence: z.number(),
  fieldConfidences: z.object({
    vendorName: z.number(),
    invoiceNumber: z.number(),
    invoiceDate: z.number(),
    dueDate: z.number(),
    subtotal: z.number(),
    taxAmount: z.number(),
    totalAmount: z.number(),
    lineItems: z.number(),
  }),
});

const SYSTEM_PROMPT = `You are a precise invoice and receipt data extractor. You will be given an image of an invoice or receipt. Extract all structured data from the document.

Rules:
1. Extract every visible field. If a field is not present in the document, omit it or use null.
2. For dates, use ISO 8601 format (YYYY-MM-DD).
3. For monetary amounts, use plain numbers without currency symbols (e.g. 150.00, not $150.00).
4. Currency should be a 3-letter ISO code (USD, EUR, GBP, etc.). Default to "USD" if unclear.
5. For each line item, categorize it into one of these categories: "Software", "Travel", "Meals", "Services", "Office Supplies", "Utilities", "Equipment", "Other".
6. Provide a confidence score between 0.0 and 1.0 for every field. 1.0 means the field was clearly readable, 0.5 means partially legible or inferred, 0.0 means a guess or not found.
7. The overall "confidence" score should be the weighted average of all field confidences.
8. Extract ALL line items visible in the document, preserving their order. Include a per-item "confidence" score (0.0–1.0) for each line item.
9. If the document is blurry, damaged, or partially cut off, do your best and reflect the uncertainty in the confidence scores.`;

const MODEL = "claude-sonnet-4-5-20250929";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ExtractionResponse {
  data: ExtractionResult;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Sends a preprocessed invoice image to Claude Vision with structured output
 * and returns the extracted, schema-validated data.
 */
export async function extractInvoiceData(
  image: ProcessedImage
): Promise<ExtractionResponse> {
  const anthropic = getClient();
  const base64Image = image.buffer.toString("base64");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mimeType,
              data: base64Image,
            },
          },
          {
            type: "text",
            text: "Extract all structured data from this invoice/receipt image.",
          },
        ],
      },
    ],
    output_config: {
      format: zodOutputFormat(aiExtractionSchema),
    },
  });

  // With structured outputs, the response is guaranteed valid JSON in content[0].text
  if (response.stop_reason === "refusal") {
    throw new Error("Claude refused to process this image for safety reasons.");
  }

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Response was truncated due to token limit. The invoice may be too complex."
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response.");
  }

  const parsed = JSON.parse(textBlock.text) as ExtractionResult;

  return {
    data: parsed,
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
