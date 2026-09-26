'use strict';

const { config } = require('../../config');
const { resolvePdfBuffer, replyWithPdfError, sendPdf, notifyWorking } = require('../../lib/pdfCommandHelper');
const { compressPdf } = require('../../services/pdf');

const QUALITIES = ['low', 'medium', 'high'];

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

module.exports = {
  name: 'compresspdf',
  aliases: ['pdfcompress', 'shrinkpdf'],
  description: 'Compresses a replied or attached PDF to reduce its file size.',
  category: 'pdf',
  usage: 'compresspdf [low|medium|high] (reply to a PDF)',
  cooldown: 15,
  async handler(ctx) {
    const { reply, text: argText } = ctx;

    const requested = argText.trim().toLowerCase();
    if (requested && !QUALITIES.includes(requested)) {
      await reply(`Quality must be one of: ${QUALITIES.join(', ')}.`);
      return;
    }
    const quality = requested || config.pdfCompressQuality;

    const doc = await resolvePdfBuffer(ctx, {
      usageHint: `Reply to a PDF with *${config.prefix}compresspdf*.`,
    });
    if (!doc) return;

    await notifyWorking(ctx);

    let result;
    try {
      result = await compressPdf(doc.buffer, { quality });
    } catch (err) {
      await replyWithPdfError(ctx, err, 'PDF compression failed.');
      return;
    }

    // Sending back a file that got bigger would be actively unhelpful, so
    // say what happened and keep the original instead.
    if (!result.saved) {
      await reply(
        `📦 That PDF is already well compressed — nothing more could be saved ` +
          `(tried: ${result.backend}).\n\nIt stays at ${formatMB(result.originalBytes)}.`
      );
      return;
    }

    const percent = Math.round((1 - result.compressedBytes / result.originalBytes) * 100);
    const baseName = doc.fileName.replace(/\.pdf$/i, '');

    await sendPdf(
      ctx,
      result.buffer,
      `${baseName}-compressed.pdf`,
      `📦 *Compressed* (${quality})\n` +
        `${formatMB(result.originalBytes)} → ${formatMB(result.compressedBytes)}  _(−${percent}%)_`
    );
  },
};
