'use strict';

const { config } = require('../../config');
const { TtlCache } = require('../../utils/ttlCache');
const { resolvePdfBuffer, replyWithPdfError, sendPdf, notifyWorking } = require('../../lib/pdfCommandHelper');
const { mergePdfs } = require('../../services/pdf');

/**
 * Merging is the one PDF operation that needs more than one input, and
 * WhatsApp only lets a message reply to a single other message. So instead
 * of trying to find several PDFs at once, this builds a queue: reply to
 * each PDF in turn to add it, then run `.mergepdf done`.
 *
 * The queue lives in memory with a TTL. It is intentionally not persisted —
 * a half-built merge from three days ago is not something anyone wants
 * restored after a restart, and holding PDF buffers on disk indefinitely
 * would be a quiet storage leak.
 */
const MERGE_TTL_MS = 15 * 60 * 1000;
const MAX_QUEUED = 10;

const mergeQueues = new TtlCache({ ttlMs: MERGE_TTL_MS, maxEntries: 100 });

function queueKey(ctx) {
  return `${ctx.from}:${ctx.sender}`;
}

function describeQueue(items) {
  return items.map((item, i) => `  ${i + 1}. ${item.fileName}`).join('\n');
}

module.exports = {
  name: 'mergepdf',
  aliases: ['pdfmerge', 'combinepdf'],
  description: 'Merges several PDFs into one. Add them by replying to each, then run with "done".',
  category: 'pdf',
  usage: 'mergepdf (reply to a PDF) | mergepdf done | mergepdf list | mergepdf clear',
  cooldown: 5,
  async handler(ctx) {
    const { reply, text: argText } = ctx;
    const action = argText.trim().toLowerCase();
    const key = queueKey(ctx);
    const queued = mergeQueues.get(key) || [];

    if (action === 'clear' || action === 'cancel') {
      mergeQueues.delete(key);
      await reply('🗑️ Merge list cleared.');
      return;
    }

    if (action === 'list' || action === 'status') {
      if (queued.length === 0) {
        await reply(`Nothing queued. Reply to a PDF with *${config.prefix}mergepdf* to add one.`);
        return;
      }
      await reply(`📚 *Queued for merging (${queued.length}):*\n${describeQueue(queued)}`);
      return;
    }

    if (action === 'done' || action === 'go' || action === 'merge') {
      if (queued.length < 2) {
        await reply(
          `Need at least 2 PDFs to merge — you have ${queued.length}.\n` +
            `Reply to another PDF with *${config.prefix}mergepdf* first.`
        );
        return;
      }

      await notifyWorking(ctx);

      try {
        const merged = await mergePdfs(queued.map((item) => item.buffer));
        await sendPdf(
          ctx,
          merged,
          'merged.pdf',
          `📚 *Merged ${queued.length} PDFs*\n${describeQueue(queued)}`
        );
        // Only clear on success — a failed merge shouldn't cost the user
        // the work of re-adding every file.
        mergeQueues.delete(key);
      } catch (err) {
        await replyWithPdfError(ctx, err, 'PDF merge failed.');
      }
      return;
    }

    if (action) {
      await reply(
        `Unknown option "${action}".\n\n` +
          `• *${config.prefix}mergepdf* (replying to a PDF) — add it\n` +
          `• *${config.prefix}mergepdf done* — merge everything added\n` +
          `• *${config.prefix}mergepdf list* — show what's queued\n` +
          `• *${config.prefix}mergepdf clear* — start over`
      );
      return;
    }

    // No argument: add the replied-to PDF to the queue.
    if (queued.length >= MAX_QUEUED) {
      await reply(
        `⚠️ You already have ${MAX_QUEUED} PDFs queued, which is the limit.\n` +
          `Run *${config.prefix}mergepdf done* or *${config.prefix}mergepdf clear*.`
      );
      return;
    }

    const doc = await resolvePdfBuffer(ctx, {
      usageHint:
        `Reply to a PDF with *${config.prefix}mergepdf* to add it to the merge list.\n` +
        `When you've added them all, run *${config.prefix}mergepdf done*.`,
    });
    if (!doc) return;

    const updated = [...queued, { buffer: doc.buffer, fileName: doc.fileName }];
    mergeQueues.set(key, updated);

    await reply(
      `➕ Added *${doc.fileName}* (${updated.length} queued).\n\n` +
        (updated.length >= 2
          ? `Run *${config.prefix}mergepdf done* to merge, or reply to another PDF to add more.`
          : `Reply to another PDF with *${config.prefix}mergepdf* to add a second one.`)
    );
  },
};
