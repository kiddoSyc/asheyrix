'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { config } = require('../config');
const logger = require('../utils/logger');
const { unwrapMessage } = require('../utils/messageContent');
const { getQuotedInfo, buildFakeMessage } = require('../utils/quoted');
const { PdfError } = require('../services/pdf/errors');

/**
 * Resolves the document a PDF command should act on — the same two shapes
 * getTargetMedia handles (attached to this message, or in the message this
 * one replies to), but specialised for documents.
 *
 * The difference that matters: this validates mimetype and size from the
 * message *node* before downloading anything. A 200MB PDF should be turned
 * away in a millisecond, not after the bot has pulled all 200MB down.
 */

const PDF_MIMETYPES = ['application/pdf', 'application/x-pdf', 'application/acrobat'];

function looksLikePdf(node) {
  if (!node) return false;
  const mimetype = String(node.mimetype || '').toLowerCase();
  if (PDF_MIMETYPES.some((m) => mimetype.startsWith(m))) return true;
  // Some clients send PDFs with a generic mimetype, so fall back to the
  // filename — which WhatsApp does preserve for documents.
  return /\.pdf$/i.test(String(node.fileName || ''));
}

function findDocumentNode(message) {
  const unwrapped = unwrapMessage(message) || message;
  if (!unwrapped) return null;

  // documentWithCaptionMessage is what newer clients send when a document
  // is posted with text attached — which is exactly the ".pdfsummary as a
  // caption" shape, so missing it would break half the intended usage.
  const withCaption = unwrapped.documentWithCaptionMessage?.message;
  if (withCaption) {
    const inner = unwrapMessage(withCaption) || withCaption;
    if (inner.documentMessage) return inner.documentMessage;
  }

  return unwrapped.documentMessage || null;
}

function assertAcceptable(node, { maxMB }) {
  if (!looksLikePdf(node)) {
    throw new PdfError('That file is not a PDF.', 'NOT_A_PDF');
  }

  const bytes = Number(node.fileLength || 0);
  const maxBytes = maxMB * 1024 * 1024;
  if (bytes && bytes > maxBytes) {
    throw new PdfError(
      `That PDF is ${(bytes / 1024 / 1024).toFixed(1)}MB, over the ${maxMB}MB limit.`,
      'TOO_LARGE'
    );
  }
}

/**
 * @param {object} sock
 * @param {object} msg
 * @param {object} [options]
 * @param {number} [options.maxMB] defaults to config.maxDownloadMB
 * @returns {Promise<{ buffer: Buffer, fileName: string, pageCountHint: number|null } | null>}
 *   null when there's no document to act on at all (so the caller can show
 *   a usage hint). Throws PdfError when there IS one but it's unusable.
 */
async function getTargetDocument(sock, msg, { maxMB = config.maxDownloadMB } = {}) {
  const direct = findDocumentNode(msg.message);
  if (direct) {
    assertAcceptable(direct, { maxMB });
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    return {
      buffer,
      fileName: direct.fileName || 'document.pdf',
      pageCountHint: direct.pageCount || null,
    };
  }

  const quoted = getQuotedInfo(msg);
  if (!quoted) return null;

  const quotedNode = findDocumentNode(quoted.message);
  if (!quotedNode) return null;

  assertAcceptable(quotedNode, { maxMB });

  const fakeMsg = buildFakeMessage({ quoted, remoteJid: msg.key.remoteJid });
  const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });

  return {
    buffer,
    fileName: quotedNode.fileName || 'document.pdf',
    pageCountHint: quotedNode.pageCount || null,
  };
}

module.exports = { getTargetDocument, looksLikePdf, findDocumentNode };
