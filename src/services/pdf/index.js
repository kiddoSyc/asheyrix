'use strict';

/**
 * One import point for every PDF capability, matching how services/ai and
 * services/downloaders are consumed. Command files import from here, never
 * from the individual modules, so the internals can be reorganised without
 * touching a dozen commands.
 */
const { PdfError } = require('./errors');
const { extractPdfText, capTextForModel } = require('./pdfText');
const { getPageCount, mergePdfs, parsePageSelection, extractPages, loadDocument } = require('./pdfDocument');
const { compressPdf } = require('./pdfCompress');
const { rasterizePdf } = require('./pdfRaster');

module.exports = {
  PdfError,
  extractPdfText,
  capTextForModel,
  getPageCount,
  mergePdfs,
  parsePageSelection,
  extractPages,
  loadDocument,
  compressPdf,
  rasterizePdf,
};
