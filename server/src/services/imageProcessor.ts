import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  originalFileType: "pdf" | "image";
  pageCount: number;
}

const MAX_DIMENSION = 2048;
const MAX_PDF_PAGES = 5;
const PDF_DPI = 200; // lower DPI per-page since we composite multiple

/**
 * Preprocesses an uploaded file (image or PDF) into a normalized image buffer
 * suitable for the Claude Vision API.
 *
 * - Images: resized to fit within 2048×2048, converted to PNG.
 * - PDFs: renders up to 5 pages, stitches them into a single vertical strip,
 *         then resizes the composite to fit within 2048px wide.
 */
export async function processFile(filePath: string): Promise<ProcessedImage> {
  const ext = path.extname(filePath).toLowerCase();
  const isPdf = ext === ".pdf";

  if (isPdf) {
    return processPdf(filePath);
  }
  return processImage(filePath);
}

async function processImage(filePath: string): Promise<ProcessedImage> {
  const inputBuffer = await fs.readFile(filePath);
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const { width, height } = computeResizeDimensions(
    metadata.width ?? MAX_DIMENSION,
    metadata.height ?? MAX_DIMENSION
  );

  const outputBuffer = await image
    .resize(width, height, { fit: "inside", withoutEnlargement: true })
    .png({ quality: 90 })
    .toBuffer();

  return {
    buffer: outputBuffer,
    mimeType: "image/png",
    width,
    height,
    originalFileType: "image",
    pageCount: 1,
  };
}

async function processPdf(filePath: string): Promise<ProcessedImage> {
  const inputBuffer = await fs.readFile(filePath);

  // First, detect total page count by loading all pages
  let totalPages: number;
  try {
    const probe = sharp(inputBuffer, { density: 72, pages: -1 });
    const meta = await probe.metadata();
    totalPages = meta.pages ?? 1;
  } catch {
    throw new Error(
      "PDF rendering requires Sharp built with libvips poppler support. " +
        "Install libvips with poppler or use a separate PDF-to-image tool."
    );
  }

  const pagesToRender = Math.min(totalPages, MAX_PDF_PAGES);

  // If only one page, use the simple path
  if (pagesToRender === 1) {
    return renderSinglePage(inputBuffer, totalPages);
  }

  // Render each page individually then stitch vertically
  return renderAndStitchPages(inputBuffer, pagesToRender, totalPages);
}

async function renderSinglePage(
  pdfBuffer: Buffer,
  totalPages: number
): Promise<ProcessedImage> {
  const image = sharp(pdfBuffer, { density: 300, pages: 1 });
  const metadata = await image.metadata();

  const { width, height } = computeResizeDimensions(
    metadata.width ?? MAX_DIMENSION,
    metadata.height ?? MAX_DIMENSION
  );

  const outputBuffer = await image
    .resize(width, height, { fit: "inside", withoutEnlargement: true })
    .png({ quality: 90 })
    .toBuffer();

  return {
    buffer: outputBuffer,
    mimeType: "image/png",
    width,
    height,
    originalFileType: "pdf",
    pageCount: totalPages,
  };
}

async function renderAndStitchPages(
  pdfBuffer: Buffer,
  pagesToRender: number,
  totalPages: number
): Promise<ProcessedImage> {
  // Render all required pages at once — Sharp returns a tall vertical strip
  // when pages > 1 with the default join behavior.
  const allPages = sharp(pdfBuffer, {
    density: PDF_DPI,
    pages: pagesToRender,
  });

  const metadata = await allPages.metadata();
  const rawWidth = metadata.width ?? MAX_DIMENSION;
  const rawHeight = metadata.height ?? MAX_DIMENSION * pagesToRender;

  console.log(
    `[imageProcessor] PDF: ${totalPages} total pages, ` +
      `rendering ${pagesToRender}, raw composite: ${rawWidth}x${rawHeight}`
  );

  // The composite is a tall vertical strip. Resize so the width fits within
  // MAX_DIMENSION. We allow height to exceed MAX_DIMENSION since the Vision
  // API handles tall images well and we need all pages readable.
  const targetWidth = Math.min(rawWidth, MAX_DIMENSION);
  const scale = targetWidth / rawWidth;
  const targetHeight = Math.round(rawHeight * scale);

  const outputBuffer = await allPages
    .resize(targetWidth, targetHeight, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ quality: 85 })
    .toBuffer();

  return {
    buffer: outputBuffer,
    mimeType: "image/png",
    width: targetWidth,
    height: targetHeight,
    originalFileType: "pdf",
    pageCount: totalPages,
  };
}

function computeResizeDimensions(
  origWidth: number,
  origHeight: number
): { width: number; height: number } {
  if (origWidth <= MAX_DIMENSION && origHeight <= MAX_DIMENSION) {
    return { width: origWidth, height: origHeight };
  }

  const ratio = Math.min(MAX_DIMENSION / origWidth, MAX_DIMENSION / origHeight);
  return {
    width: Math.round(origWidth * ratio),
    height: Math.round(origHeight * ratio),
  };
}
