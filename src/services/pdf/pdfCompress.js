'use strict';

const fs = require('fs');
const { runBinary } = require('./binaryRunner');
const { loadDocument } = require('./pdfDocument');
const { PdfError } = require('./errors');
const { makeTempPath, cleanupTempFile } = require('../downloaders/tempFile');
const logger = require('../../utils/logger');

/**
 * Compresses a PDF, trying three backends in descending order of how much
 * they can actually save:
 *
 *   1. ghostscript — the only one that re-encodes and downsamples embedded
 *      images, which is where the bytes live in most oversized PDFs.
 *      Typically 40-80% on scan-heavy files. Not installed by default.
 *   2. qpdf — recompresses streams and packs objects. Lossless and safe,
 *      but only helps meaningfully on PDFs that were written inefficiently;
 *      on an already-tight file it can come out marginally *larger*.
 *   3. pdf-lib — re-saves through object streams. The weakest option, but
 *      it needs no system binary at all, so compression still does
 *      something on a bare Node install.
 *
 * Each backend is skipped if its binary is missing, so this degrades
 * quietly rather than failing. The caller gets told which one ran.
 */

const QUALITY_PRESETS = {
  // Ghostscript's built-in PDFSETTINGS profiles, mapped to plain words.
  low: '/screen', // most aggressive — 72dpi images
  medium: '/ebook', // 150dpi, a good default
  high: '/prepress', // 300dpi, barely lossy
};

async function compressWithGhostscript(inputPath, outputPath, quality) {
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;
  await runBinary(
    'gs',
    [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${preset}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      '-dSAFER',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ],
    { toolLabel: 'ghostscript' }
  );
  return 'ghostscript';
}

async function compressWithQpdf(inputPath, outputPath) {
  await runBinary(
    'qpdf',
    [
      '--object-streams=generate',
      '--recompress-flate',
      '--compression-level=9',
      '--stream-data=compress',
      inputPath,
      outputPath,
    ],
    { toolLabel: 'qpdf' }
  );
  return 'qpdf';
}

async function compressWithPdfLib(inputPath, outputPath) {
  const doc = await loadDocument(fs.readFileSync(inputPath));
  const bytes = await doc.save({ useObjectStreams: true });
  fs.writeFileSync(outputPath, bytes);
  return 'pdf-lib';
}

/**
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {'low'|'medium'|'high'} [options.quality]
 * @returns {Promise<{ buffer: Buffer, backend: string, originalBytes: number, compressedBytes: number, saved: boolean }>}
 */
async function compressPdf(buffer, { quality = 'medium' } = {}) {
  const inputPath = makeTempPath('.pdf');
  const outputPath = makeTempPath('.pdf');
  fs.writeFileSync(inputPath, buffer);

  const backends = [
    () => compressWithGhostscript(inputPath, outputPath, quality),
    () => compressWithQpdf(inputPath, outputPath),
    () => compressWithPdfLib(inputPath, outputPath),
  ];

  try {
    let lastError = null;

    for (const attempt of backends) {
      try {
        const backend = await attempt();
        const compressed = fs.readFileSync(outputPath);

        return {
          buffer: compressed,
          backend,
          originalBytes: buffer.length,
          compressedBytes: compressed.length,
          // A "compressed" file that grew is not a success worth sending.
          saved: compressed.length < buffer.length,
        };
      } catch (err) {
        lastError = err;
        // A missing binary is expected on most installs — move down the
        // chain silently. A real failure is worth a log line.
        if (err instanceof PdfError && err.code === 'TOOL_MISSING') continue;
        logger.warn({ err }, 'A PDF compression backend failed — trying the next one.');
      }
    }

    throw lastError instanceof PdfError
      ? lastError
      : new PdfError('Could not compress that PDF.', 'FAILED');
  } finally {
    cleanupTempFile(inputPath);
    cleanupTempFile(outputPath);
  }
}

module.exports = { compressPdf, QUALITY_PRESETS };
