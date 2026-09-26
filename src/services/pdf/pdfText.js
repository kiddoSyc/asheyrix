'use strict';

const { PdfError } = require('./errors');
const logger = require('../../utils/logger');

/**
 * Text extraction from a PDF buffer using pdfjs-dist.
 *
 * pdfjs-dist ships as ESM only, and this project is CommonJS, so it's
 * pulled in with a dynamic import() rather than require(). The module is
 * cached after the first call — loading it is not cheap and a bot can run
 * these commands repeatedly.
 *
 * The `legacy` build is the one to use here: the modern build assumes
 * browser globals that don't exist under Node.
 */
let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').catch((err) => {
      // Reset so a transient failure doesn't poison every later call.
      pdfjsPromise = null;
      logger.error({ err }, 'Failed to load pdfjs-dist.');
      throw new PdfError(
        'The PDF text engine failed to load. Ask the bot owner to run "npm install".',
        'TOOL_MISSING'
      );
    });
  }
  return pdfjsPromise;
}

/**
 * Pulls the text out of a PDF, page by page.
 *
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {number} [options.maxPages] stop after this many pages
 * @returns {Promise<{ text: string, pages: string[], pageCount: number, truncated: boolean }>}
 */
async function extractPdfText(buffer, { maxPages = 100 } = {}) {
  const pdfjs = await loadPdfjs();

  // Held separately from the document: in pdfjs 6.x the teardown method
  // lives on the loading task, not on the document proxy (which only
  // exposes a per-page cleanup()). Calling doc.destroy() throws.
  let loadingTask;
  let doc;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // These two keep pdfjs from reaching for browser-only features and
      // from evaluating font programs it doesn't need for text extraction.
      useSystemFonts: true,
      isEvalSupported: false,
      // pdfjs is chatty about recoverable oddities in real-world PDFs.
      verbosity: 0,
    });
    doc = await loadingTask.promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new PdfError('That PDF is password-protected, so its text cannot be read.', 'ENCRYPTED');
    }
    logger.warn({ err }, 'pdfjs could not open a PDF.');
    throw new PdfError('That file could not be opened as a PDF — it may be corrupted.', 'FAILED');
  }

  const pageCount = doc.numPages;
  const limit = Math.min(pageCount, maxPages);
  const pages = [];

  try {
    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();

      // pdfjs emits one item per text run. `hasEOL` marks a line break in
      // the source layout — honouring it keeps paragraphs and tables
      // readable instead of collapsing a whole page into one line.
      let pageText = '';
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }

      pages.push(pageText.replace(/[ \t]+/g, ' ').trim());
      page.cleanup();
    }
  } finally {
    // Releases the worker and its buffers. Cleanup must never mask a real
    // error, so failures here are swallowed.
    await loadingTask.destroy().catch(() => {});
  }

  const text = pages
    .map((p, i) => (p ? `--- Page ${i + 1} ---\n${p}` : ''))
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return { text, pages, pageCount, truncated: pageCount > limit };
}

/**
 * Trims extracted text to something a model will accept, cutting at a
 * paragraph boundary where possible so a sentence isn't sliced in half.
 * Returns the text plus whether anything was dropped, so the caller can
 * tell the user their answer covers only part of the document.
 */
function capTextForModel(text, maxChars) {
  if (text.length <= maxChars) return { text, truncated: false };

  const slice = text.slice(0, maxChars);
  const lastBreak = slice.lastIndexOf('\n\n');
  const cut = lastBreak > maxChars * 0.5 ? slice.slice(0, lastBreak) : slice;

  return { text: cut.trim(), truncated: true };
}

module.exports = { extractPdfText, capTextForModel };
