'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');
const { TtlCache } = require('../utils/ttlCache');
const { getTargetDocument } = require('./getTargetDocument');
const { PdfError, extractPdfText, rasterizePdf } = require('../services/pdf');
const { runTesseract } = require('../services/media/ocrRunner');
const { MediaError } = require('../services/media/errors');

/**
 * Shared plumbing for the PDF commands, so .pdfsummary, .askpdf and
 * .translatepdf behave identically about what counts as "the PDF we're
 * talking about", how failures are phrased, and how much text is read.
 */

// Extracted text is cached per person per chat so a conversation like
//   .askpdf what's the deadline?
//   .askpdf and who signed it?
// works without re-replying to the document each time. Short-lived on
// purpose: this is a convenience, not a document store.
const pdfTextCache = new TtlCache({ ttlMs: 30 * 60 * 1000, maxEntries: 200 });

function cacheKey(ctx) {
  return `${ctx.from}:${ctx.sender}`;
}

/**
 * Runs OCR across the first few pages of a PDF that has no text layer.
 * Scanned documents are common enough that failing with "no text found"
 * without trying this would be the wrong answer most of the time.
 */
async function ocrPdf(buffer, { maxPages }) {
  const rendered = await rasterizePdf(buffer, { firstPage: 1, lastPage: maxPages });

  try {
    const pages = [];
    for (const imagePath of rendered.paths) {
      try {
        const text = await runTesseract(imagePath);
        if (text.trim()) pages.push(text.trim());
      } catch (err) {
        if (err instanceof MediaError && err.code === 'TOOL_MISSING') {
          throw new PdfError(
            'That PDF is a scan with no text layer, and reading it needs Tesseract (OCR) installed. ' +
              'Ask the bot owner to install it (see README).',
            'TOOL_MISSING'
          );
        }
        logger.warn({ err, imagePath }, 'OCR failed on one PDF page — continuing with the rest.');
      }
    }
    return pages;
  } finally {
    rendered.cleanup();
  }
}

/**
 * Resolves the PDF for this command and extracts its text.
 *
 * Falls back in order: the replied-to/attached PDF, then the last PDF this
 * person used in this chat. Returns null after replying with a usage hint
 * when neither is available.
 *
 * @returns {Promise<{ text: string, fileName: string, pageCount: number, truncated: boolean, fromCache: boolean } | null>}
 */
async function resolvePdfText(ctx, { usageHint, allowCache = true, ocrFallback = true } = {}) {
  const { sock, msg, reply } = ctx;

  let doc = null;
  try {
    doc = await getTargetDocument(sock, msg);
  } catch (err) {
    if (err instanceof PdfError) {
      await reply(`⚠️ ${err.message}`);
      return null;
    }
    logger.error({ err }, 'Failed to fetch the target PDF.');
    await reply('❌ Failed to read that document. The error has been logged.');
    return null;
  }

  if (!doc) {
    if (allowCache) {
      const cached = pdfTextCache.get(cacheKey(ctx));
      if (cached) return { ...cached, fromCache: true };
    }
    await reply(usageHint);
    return null;
  }

  await notifyWorking(ctx);

  let extracted;
  try {
    extracted = await extractPdfText(doc.buffer, { maxPages: config.pdfMaxPages });
  } catch (err) {
    if (err instanceof PdfError) {
      await reply(`⚠️ ${err.message}`);
      return null;
    }
    logger.error({ err }, 'PDF text extraction failed.');
    await reply('❌ Could not read that PDF. The error has been logged.');
    return null;
  }

  let text = extracted.text;

  // No text layer at all — almost always a scan or an export-to-image PDF.
  if (!text.trim() && ocrFallback) {
    await reply('📄 No text layer in that PDF — running OCR on it, this can take a moment...');
    try {
      const pages = await ocrPdf(doc.buffer, { maxPages: config.pdfOcrMaxPages });
      text = pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join('\n\n').trim();
    } catch (err) {
      if (err instanceof PdfError) {
        await reply(`⚠️ ${err.message}`);
        return null;
      }
      logger.error({ err }, 'PDF OCR fallback failed.');
      await reply('❌ Could not read that scanned PDF. The error has been logged.');
      return null;
    }
  }

  if (!text.trim()) {
    await reply('📄 No readable text could be found in that PDF.');
    return null;
  }

  const result = {
    text,
    fileName: doc.fileName,
    pageCount: extracted.pageCount,
    truncated: extracted.truncated,
    fromCache: false,
  };

  if (allowCache) {
    pdfTextCache.set(cacheKey(ctx), { ...result, fromCache: false });
  }

  return result;
}

/**
 * Resolves just the raw PDF bytes, for the commands that manipulate the
 * file rather than read it (.compresspdf, .splitpdf, .mergepdf).
 */
async function resolvePdfBuffer(ctx, { usageHint } = {}) {
  const { sock, msg, reply } = ctx;

  let doc = null;
  try {
    doc = await getTargetDocument(sock, msg);
  } catch (err) {
    if (err instanceof PdfError) {
      await reply(`⚠️ ${err.message}`);
      return null;
    }
    logger.error({ err }, 'Failed to fetch the target PDF.');
    await reply('❌ Failed to read that document. The error has been logged.');
    return null;
  }

  if (!doc) {
    await reply(usageHint);
    return null;
  }

  return doc;
}

/**
 * Shows a "typing" indicator. PDF work plus a model round-trip can run for
 * a while, and without this the bot looks frozen.
 */
async function notifyWorking(ctx) {
  try {
    await ctx.sock.sendPresenceUpdate('composing', ctx.from);
  } catch {
    // Presence is cosmetic — never let it block the actual work.
  }
}

/**
 * Turns a PdfError into a user-facing reply and anything else into a
 * logged, generic one. Used by the file-manipulation commands, which don't
 * go through resolvePdfText's error handling.
 */
async function replyWithPdfError(ctx, err, context) {
  if (err instanceof PdfError) {
    await ctx.reply(`⚠️ ${err.message}`);
    return;
  }
  logger.error({ err }, context || 'A PDF command failed unexpectedly.');
  await ctx.reply('❌ That PDF operation failed. The error has been logged.');
}

/**
 * Sends a PDF back as a document, which is the only shape WhatsApp will
 * show with a filename and an open-in-reader affordance.
 */
async function sendPdf(ctx, buffer, fileName, caption) {
  await ctx.sock.sendMessage(
    ctx.from,
    {
      document: buffer,
      mimetype: 'application/pdf',
      fileName: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
      caption,
    },
    { quoted: ctx.msg }
  );
}

module.exports = {
  resolvePdfText,
  resolvePdfBuffer,
  replyWithPdfError,
  sendPdf,
  notifyWorking,
  pdfTextCache,
};
