'use strict';

const fs = require('fs');
const { config } = require('../../config');
const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { runFfmpeg } = require('../../services/media/ffmpegRunner');
const { getTargetMedia } = require('../../lib/getTargetMedia');
const { runImageGeneration } = require('../../lib/imageCommandHelper');
const { toSticker } = require('../../services/media/imageFilters');
const { makeTempPath, cleanupTempFile } = require('../../services/downloaders/tempFile');
const { MediaError } = require('../../services/media/errors');
const logger = require('../../utils/logger');

const STICKER_FILTER =
  'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000';

/**
 * Two behaviours behind one command, chosen by what the user gave it:
 *
 *   • replied/attached media  → convert it (the original behaviour)
 *   • a text prompt, no media → generate an image, then convert that
 *
 * Media wins when both are present, because ".sticker" as a caption on a
 * photo is an existing habit and quietly generating something else instead
 * would be a surprising regression.
 */
module.exports = {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  description: 'Turns a replied image/video into a sticker, or generates one from a prompt.',
  category: 'media',
  usage: 'sticker (reply to an image/video) | sticker <prompt>',
  cooldown: 8,
  async handler(ctx) {
    const prompt = ctx.text.trim();

    // Probe for media before deciding. A failure here isn't fatal: if there
    // is a prompt to fall back on, generating is still a sensible outcome.
    let media = null;
    try {
      media = await getTargetMedia(ctx.sock, ctx.msg);
    } catch (err) {
      logger.warn({ err }, 'Could not read replied media for .sticker.');
    }

    const usableMedia =
      media && ['imageMessage', 'videoMessage', 'stickerMessage'].includes(media.type);

    if (!usableMedia && prompt) {
      await generateSticker(ctx, prompt);
      return;
    }

    await runMediaCommand(ctx, {
      allowedTypes: ['imageMessage', 'videoMessage', 'stickerMessage'],
      usageHint: `an image or short video with *${config.prefix}sticker* — or use *${config.prefix}sticker <prompt>* to generate one`,
      inputExt: (m) => (m.type === 'videoMessage' ? '.mp4' : '.jpg'),
      outputExt: '.webp',
      async convert(inputPath, outputPath, m) {
        const args =
          m.type === 'videoMessage'
            ? ['-i', inputPath, '-t', '6', '-vf', STICKER_FILTER, '-r', '15', '-an', '-vsync', '0', outputPath]
            : ['-i', inputPath, '-vf', STICKER_FILTER, outputPath];
        await runFfmpeg(args);
      },
      async send(buffer) {
        await ctx.sock.sendMessage(ctx.from, { sticker: buffer }, { quoted: ctx.msg });
      },
    });
  },
};

/**
 * Generates an image and converts it to a sticker in one step. The
 * generation half is delegated so the provider handling, timeout, and error
 * phrasing match every other image command; only the delivery differs.
 */
async function generateSticker(ctx, prompt) {
  await runImageGeneration(ctx, {
    prompt:
      `${prompt}. Sticker art style: bold clean outlines, flat vibrant colours, ` +
      'simple centred subject, plain uncluttered background, no text.',
    size: 'square',
    async send(buffer) {
      const inputPath = makeTempPath('.png');
      const outputPath = makeTempPath('.webp');

      try {
        fs.writeFileSync(inputPath, buffer);
        await toSticker(inputPath, outputPath);
        await ctx.sock.sendMessage(ctx.from, { sticker: fs.readFileSync(outputPath) }, { quoted: ctx.msg });
      } catch (err) {
        // ffmpeg missing shouldn't waste the generation that already
        // succeeded — send the plain image instead of failing outright.
        if (err instanceof MediaError && err.code === 'TOOL_MISSING') {
          await ctx.sock.sendMessage(
            ctx.from,
            { image: buffer, caption: `🎨 ${prompt}\n\n_(ffmpeg isn't installed, so this couldn't be made into a sticker.)_` },
            { quoted: ctx.msg }
          );
          return;
        }
        throw err;
      } finally {
        cleanupTempFile(inputPath);
        cleanupTempFile(outputPath);
      }
    },
  });
}
