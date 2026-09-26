'use strict';

const { PDFDocument } = require('pdf-lib');
const { PdfError } = require('./errors');
const logger = require('../../utils/logger');

/**
 * Structural PDF operations — page counting, merging, and page extraction.
 *
 * pdf-lib is pure JavaScript with no native build step and no external
 * binary, which matters for a bot that people deploy on phones (Termux)
 * and small VPSes. Everything here works offline.
 */

async function loadDocument(buffer, { forEditing = true } = {}) {
  try {
    return await PDFDocument.load(buffer, {
      // Many real-world PDFs have small spec violations that are harmless
      // for our purposes; refusing them outright would reject files that
      // every PDF reader opens fine.
      ignoreEncryption: !forEditing,
      updateMetadata: false,
    });
  } catch (err) {
    const message = String(err?.message || '');
    if (/encrypt/i.test(message)) {
      throw new PdfError('That PDF is password-protected, so it cannot be edited.', 'ENCRYPTED');
    }
    logger.warn({ err }, 'pdf-lib could not load a PDF.');
    throw new PdfError('That file could not be opened as a PDF — it may be corrupted.', 'FAILED');
  }
}

async function getPageCount(buffer) {
  const doc = await loadDocument(buffer, { forEditing: false });
  return doc.getPageCount();
}

/**
 * Merges several PDFs into one, in the order given.
 *
 * @param {Buffer[]} buffers
 * @returns {Promise<Buffer>}
 */
async function mergePdfs(buffers) {
  if (!Array.isArray(buffers) || buffers.length < 2) {
    throw new PdfError('Merging needs at least two PDFs.', 'FAILED');
  }

  const merged = await PDFDocument.create();

  for (const [index, buffer] of buffers.entries()) {
    let source;
    try {
      source = await loadDocument(buffer);
    } catch (err) {
      // Name which file failed — with several queued up, "one of them is
      // broken" is not a useful thing to tell someone.
      if (err instanceof PdfError) {
        throw new PdfError(`PDF #${index + 1} could not be read: ${err.message}`, err.code);
      }
      throw err;
    }

    const pageIndices = source.getPageIndices();
    const copied = await merged.copyPages(source, pageIndices);
    for (const page of copied) merged.addPage(page);
  }

  return Buffer.from(await merged.save());
}

/**
 * Parses a user-supplied page selection into zero-based indices.
 *
 * Accepts: "3" (single), "2-5" (range), "1,3,7" (list), and combinations
 * such as "1,4-6". Page numbers are 1-based for the user, because that's
 * what their PDF reader shows them.
 *
 * @returns {number[]} sorted, de-duplicated, zero-based indices
 */
function parsePageSelection(input, pageCount) {
  const cleaned = String(input || '').replace(/\s+/g, '');
  if (!cleaned) throw new PdfError('No pages were selected.', 'BAD_RANGE');

  const indices = new Set();

  for (const part of cleaned.split(',')) {
    if (!part) continue;

    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1 || start > end) {
        throw new PdfError(`"${part}" is not a valid page range.`, 'BAD_RANGE');
      }
      if (end > pageCount) {
        throw new PdfError(`That PDF only has ${pageCount} page(s), so "${part}" is out of range.`, 'BAD_RANGE');
      }
      for (let p = start; p <= end; p++) indices.add(p - 1);
      continue;
    }

    if (!/^\d+$/.test(part)) {
      throw new PdfError(`"${part}" is not a page number or range.`, 'BAD_RANGE');
    }

    const page = Number(part);
    if (page < 1 || page > pageCount) {
      throw new PdfError(`That PDF only has ${pageCount} page(s), so page ${page} does not exist.`, 'BAD_RANGE');
    }
    indices.add(page - 1);
  }

  if (indices.size === 0) throw new PdfError('No pages were selected.', 'BAD_RANGE');
  return [...indices].sort((a, b) => a - b);
}

/**
 * Builds a new PDF containing only the given (zero-based) page indices.
 */
async function extractPages(buffer, pageIndices) {
  const source = await loadDocument(buffer);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, pageIndices);
  for (const page of copied) out.addPage(page);
  return Buffer.from(await out.save());
}

module.exports = {
  loadDocument,
  getPageCount,
  mergePdfs,
  parsePageSelection,
  extractPages,
};
