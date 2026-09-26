'use strict';

const fs = require('fs');
const { config } = require('../../config');
const { removeBackground } = require('../../services/imagegen');
const {
  resolveSourceImage,
  replyWithImageError,
  showWorking,
  stopWorking,
} = require('../../lib/imageCommandHelper');
const { toSticker } = require('../../services/media/imageFilters');
const { makeTempPath, cleanupTempFile } = require('../../services/downloaders/tempFile');
const { MediaError } = require('../../services/media/errors');
const logger = require('../../utils/logger');

/**
 * Background removal, delivered two ways.
 *
 * The result is a PNG with an alpha channel — but WhatsApp flattens image
 * messages onto a white background, which would throw away the entire point
 * of the operation. Stickers are the only message type that renders
 * transparency, so the cut-out is sent as a sticker as well as a document.
 * The document is what the user needs if they're going to use the file
 * anywhere else, since WhatsApp doesn't let you save a sticker as a PNG.
 */
module.exports = {
  name: 'removebg',
  aliases: ['rmbg', 'nobg'],
  description: 'Removes the background from a replied image.',
  category: 'imageai',
  usage: 'removebg (reply to an image)',
  cooldown: 20,
  async handler(ctx) {
    const { reply } = ctx;

    const source = await resolveSourceImage(ctx, {
      usageHint: `Reply to an image with *${config.prefix}removebg*.`,
    });
    if (!source) return;

    await showWorking(ctx);

    let result;
    try {
      result = await removeBackground({
        imageBuffer: source.buffer,
        mimetype: source.mimetype,
      });
    } catch (err) {
      await replyWithImageError(ctx, err, 'Background removal failed.');
      return;
    } finally {
      await stopWorking(ctx);
    }

    // The PNG first — this is the file with the transparency intact.
    try {
      await ctx.sock.sendMessage(
        ctx.from,
        {
          document: result.buffer,
          mimetype: 'image/png',
          fileName: 'no-background.png',
          caption: '🪄 *Background removed* — the PNG keeps the transparency.',
        },
        { quoted: ctx.msg }
      );
    } catch (err) {
      logger.error({ err }, 'Failed to send the cut-out PNG.');
      await reply('❌ The background was removed but the file could not be sent.');
      return;
    }

    // Then a sticker, so the result is actually visible in the chat.
    const inputPath = makeTempPath('.png');
    const outputPath = makeTempPath('.webp');
    try {
      fs.writeFileSync(inputPath, result.buffer);
      await toSticker(inputPath, outputPath);
      await ctx.sock.sendMessage(ctx.from, { sticker: fs.readFileSync(outputPath) }, { quoted: ctx.msg });
    } catch (err) {
      // The PNG already went out, so this is a nice-to-have. Don't turn a
      // successful operation into an error message over it.
      if (err instanceof MediaError && err.code === 'TOOL_MISSING') {
        logger.info('Skipped the sticker preview for .removebg — ffmpeg is not installed.');
      } else {
        logger.warn({ err }, 'Could not build the sticker preview for .removebg.');
      }
    } finally {
      cleanupTempFile(inputPath);
      cleanupTempFile(outputPath);
    }
  },
};
