'use strict';

const fs = require('fs');
const path = require('path');
const { runBinary } = require('./binaryRunner');
const { PdfError } = require('./errors');
const { makeTempPath, cleanupTempFile, TEMP_DIR } = require('../downloaders/tempFile');
const logger = require('../../utils/logger');

/**
 * Renders PDF pages to PNG images.
 *
 * This exists for one reason: OCR. A PDF that came from a scanner or a
 * photo has no text layer at all — pdfjs returns an empty string for it —
 * so the only way to read it is to turn each page into an image and run
 * Tesseract over that.
 *
 * Two backends, tried in order: poppler's pdftoppm (fast, and the usual
 * companion install alongside Tesseract), then ghostscript. Both are
 * optional; if neither is present the caller gets a TOOL_MISSING error it
 * can turn into an actionable message.
 */

// 200 DPI is the sweet spot for OCR accuracy vs. render time. Below ~150
// Tesseract's accuracy drops off sharply; above 300 it gets slower with
// little accuracy gained.
const OCR_DPI = 200;

async function rasterizeWithPdftoppm(inputPath, outPrefix, firstPage, lastPage) {
  await runBinary(
    'pdftoppm',
    [
      '-png',
      '-r', String(OCR_DPI),
      '-f', String(firstPage),
      '-l', String(lastPage),
      inputPath,
      outPrefix,
    ],
    { toolLabel: 'pdftoppm (poppler-utils)' }
  );
}

async function rasterizeWithGhostscript(inputPath, outPrefix, firstPage, lastPage) {
  await runBinary(
    'gs',
    [
      '-sDEVICE=png16m',
      `-r${OCR_DPI}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      '-dSAFER',
      `-dFirstPage=${firstPage}`,
      `-dLastPage=${lastPage}`,
      // %d expands to the page number, matching pdftoppm's naming closely
      // enough that the collection step below handles both.
      `-sOutputFile=${outPrefix}-%d.png`,
      inputPath,
    ],
    { toolLabel: 'ghostscript' }
  );
}

/**
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {number} [options.firstPage] 1-based, inclusive
 * @param {number} [options.lastPage]  1-based, inclusive
 * @returns {Promise<{ paths: string[], cleanup: () => void }>}
 *   Caller MUST call cleanup() when done with the images.
 */
async function rasterizePdf(buffer, { firstPage = 1, lastPage = 5 } = {}) {
  const inputPath = makeTempPath('.pdf');
  fs.writeFileSync(inputPath, buffer);

  // makeTempPath with no extension gives a unique basename the tools can
  // append their own "-1.png", "-2.png" to.
  const outPrefix = makeTempPath('');

  try {
    let rendered = false;
    let lastError = null;

    for (const attempt of [rasterizeWithPdftoppm, rasterizeWithGhostscript]) {
      try {
        await attempt(inputPath, outPrefix, firstPage, lastPage);
        rendered = true;
        break;
      } catch (err) {
        lastError = err;
        if (err instanceof PdfError && err.code === 'TOOL_MISSING') continue;
        logger.warn({ err }, 'A PDF rasteriser failed — trying the next one.');
      }
    }

    if (!rendered) {
      if (lastError instanceof PdfError && lastError.code === 'TOOL_MISSING') {
        throw new PdfError(
          'Reading a scanned PDF needs poppler-utils or ghostscript installed. ' +
            'Ask the bot owner to install one (see README).',
          'TOOL_MISSING'
        );
      }
      throw lastError instanceof PdfError ? lastError : new PdfError('Could not render that PDF.', 'FAILED');
    }

    // Both tools write alongside the prefix rather than telling us what
    // they produced, so collect by matching the prefix's basename.
    const prefixName = path.basename(outPrefix);
    const paths = fs
      .readdirSync(TEMP_DIR)
      .filter((name) => name.startsWith(prefixName) && name.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => path.join(TEMP_DIR, name));

    if (paths.length === 0) {
      throw new PdfError('That PDF produced no readable pages.', 'FAILED');
    }

    return {
      paths,
      cleanup: () => {
        for (const p of paths) cleanupTempFile(p);
      },
    };
  } finally {
    cleanupTempFile(inputPath);
  }
}

module.exports = { rasterizePdf, OCR_DPI };
