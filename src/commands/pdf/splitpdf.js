'use strict';

const { config } = require('../../config');
const { resolvePdfBuffer, replyWithPdfError, sendPdf, notifyWorking } = require('../../lib/pdfCommandHelper');
const { getPageCount, parsePageSelection, extractPages, PdfError } = require('../../services/pdf');

module.exports = {
  name: 'splitpdf',
  aliases: ['pdfsplit'],
  description: 'Splits a replied PDF into single pages, or pulls out a page range.',
  category: 'pdf',
  usage: 'splitpdf [page | range] (reply to a PDF)',
  cooldown: 15,
  async handler(ctx) {
    const { reply, text: argText } = ctx;
    const selection = argText.trim();

    const doc = await resolvePdfBuffer(ctx, {
      usageHint:
        `Reply to a PDF with *${config.prefix}splitpdf*.\n\n` +
        `• *${config.prefix}splitpdf* — every page as its own file\n` +
        `• *${config.prefix}splitpdf 3* — just page 3\n` +
        `• *${config.prefix}splitpdf 2-5* — pages 2 to 5 as one file\n` +
        `• *${config.prefix}splitpdf 1,4-6* — a mixed selection as one file`,
    });
    if (!doc) return;

    await notifyWorking(ctx);

    let pageCount;
    try {
      pageCount = await getPageCount(doc.buffer);
    } catch (err) {
      await replyWithPdfError(ctx, err, 'Could not read the PDF page count.');
      return;
    }

    if (pageCount < 2) {
      await reply('📄 That PDF only has one page, so there is nothing to split.');
      return;
    }

    const baseName = doc.fileName.replace(/\.pdf$/i, '');

    // With a selection, the user gets one file containing exactly those
    // pages — the far more common intent than "explode it into pieces".
    if (selection) {
      let indices;
      try {
        indices = parsePageSelection(selection, pageCount);
      } catch (err) {
        await replyWithPdfError(ctx, err, 'Bad page selection.');
        return;
      }

      try {
        const buffer = await extractPages(doc.buffer, indices);
        const label = indices.length === 1 ? `page ${indices[0] + 1}` : `${indices.length} pages`;
        await sendPdf(ctx, buffer, `${baseName}-p${selection}.pdf`, `✂️ *Extracted ${label}*`);
      } catch (err) {
        await replyWithPdfError(ctx, err, 'Page extraction failed.');
      }
      return;
    }

    // No selection: split into individual pages. A 300-page document would
    // mean 300 messages, so cap it and point at the range syntax instead of
    // flooding the chat.
    if (pageCount > config.pdfMaxSplitOutputs) {
      await reply(
        `📄 That PDF has ${pageCount} pages — splitting it would send ${pageCount} files.\n\n` +
          `Pick a range instead, e.g. *${config.prefix}splitpdf 1-${config.pdfMaxSplitOutputs}*.`
      );
      return;
    }

    let sent = 0;
    try {
      for (let i = 0; i < pageCount; i++) {
        const buffer = await extractPages(doc.buffer, [i]);
        await sendPdf(ctx, buffer, `${baseName}-p${i + 1}.pdf`, `✂️ Page ${i + 1} of ${pageCount}`);
        sent += 1;
      }
    } catch (err) {
      // Partial success is worth reporting — the pages already sent are
      // still useful, and silently stopping would look like a hang.
      if (sent > 0) {
        await reply(`⚠️ Sent ${sent} of ${pageCount} pages before something went wrong.`);
      }
      await replyWithPdfError(ctx, err, 'PDF split failed.');
    }
  },
};
