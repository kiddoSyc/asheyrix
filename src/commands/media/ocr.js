'use strict';

const fs = require('fs');
const { config } = require('../../config');
const { getTargetMedia } = require('../../lib/getTargetMedia');
const { getTargetDocument } = require('../../lib/getTargetDocument');
const { runTesseract } = require('../../services/media/ocrRunner');
const { makeTempPath, cleanupTempFile } = require('../../services/downloaders/tempFile');
const { MediaError } = require('../../services/media/errors');
const { PdfError, extractPdfText, rasterizePdf } = require('../../services/pdf');
const { chunkText } = require('../../lib/aiCommandHelper');
const logger = require('../../utils/logger');

/**
 * Text extraction from whatever was replied to.
 *
 * Images go straight to Tesseract. PDFs take the cheaper route first: if the
 * file has a real text layer, reading it is instant and perfectly accurate,
 * so OCR is only used on PDFs that turn out to be scans.
 */

async function ocrImage(buffer) {
  const inputPath = makeTempPath('.png');
  fs.writeFileSync(inputPath, buffer);
  try {
    return await runTesseract(inputPath);
  } finally {
    cleanupTempFile(inputPath);
  }
}

async function ocrPdfPages(buffer) {
  const rendered = await rasterizePdf(buffer, { firstPage: 1, lastPage: config.pdfOcrMaxPages });
  try {
    const pages = [];
    for (const [index, imagePath] of rendered.paths.entries()) {
      try {
        const text = await runTesseract(imagePath);
        if (text.trim()) pages.push(`--- Page ${index + 1} ---\n${text.trim()}`);
      } catch (err) {
        if (err instanceof MediaError && err.code === 'TOOL_MISSING') throw err;
        logger.warn({ err, imagePath }, 'OCR failed on one page — continuing with the rest.');
      }
    }
    return pages.join('\n\n');
  } finally {
    rendered.cleanup();
  }
}

module.exports = {
  name: 'ocr',
  aliases: ['readtext', 'extracttext'],
  description: 'Extracts readable text from a replied image or PDF.',
  category: 'media',
  usage: 'ocr (reply to an image or PDF)',
  cooldown: 10,
  async handler(ctx) {
    const { sock, msg, reply } = ctx;

    // Try the document path first: a PDF is also matched by getTargetMedia
    // (as documentMessage), so checking images first would send PDF bytes
    // to Tesseract and get nothing back.
    let doc = null;
    try {
      doc = await getTargetDocument(sock, msg);
    } catch (err) {
      if (err instanceof PdfError && err.code !== 'NOT_A_PDF') {
        await reply(`⚠️ ${err.message}`);
        return;
      }
      // NOT_A_PDF just means the attached document is something else —
      // fall through and let the image path decide.
    }

    if (doc) {
      await handlePdf(ctx, doc);
      return;
    }

    let media;
    try {
      media = await getTargetMedia(sock, msg);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch target media for OCR.');
      await reply('❌ Failed to read that file. The error has been logged.');
      return;
    }

    if (!media || (media.type !== 'imageMessage' && media.type !== 'stickerMessage')) {
      await reply(`Reply to an image or a PDF with *${config.prefix}ocr*.`);
      return;
    }

    try {
      const text = await ocrImage(media.buffer);
      await sendResult(ctx, text.trim(), 'image');
    } catch (err) {
      await handleFailure(ctx, err);
    }
  },
};

async function handlePdf(ctx, doc) {
  const { reply } = ctx;

  try {
    await ctx.sock.sendPresenceUpdate('composing', ctx.from);
  } catch {
    /* cosmetic */
  }

  try {
    // A real text layer beats OCR every time — it's exact, and free.
    const extracted = await extractPdfText(doc.buffer, { maxPages: config.pdfMaxPages });
    if (extracted.text.trim()) {
      await sendResult(ctx, extracted.text.trim(), `${doc.fileName} (text layer)`);
      return;
    }

    await reply('📄 No text layer in that PDF — running OCR on the pages, this can take a moment...');
    const text = await ocrPdfPages(doc.buffer);
    await sendResult(ctx, text.trim(), `${doc.fileName} (OCR)`);
  } catch (err) {
    await handleFailure(ctx, err);
  }
}

async function sendResult(ctx, text, sourceLabel) {
  if (!text) {
    await ctx.reply('No readable text was found.');
    return;
  }

  for (const chunk of chunkText(`📝 *Extracted text* — _${sourceLabel}_\n\n${text}`)) {
    await ctx.reply(chunk);
  }
}

async function handleFailure(ctx, err) {
  if (err instanceof MediaError || err instanceof PdfError) {
    await ctx.reply(`⚠️ ${err.message}`);
    return;
  }
  logger.error({ err }, 'OCR failed unexpectedly.');
  await ctx.reply('❌ OCR failed. The error has been logged.');
}
