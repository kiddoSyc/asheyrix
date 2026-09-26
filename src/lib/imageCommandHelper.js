'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');
const { generate, imageStatus } = require('../services/imagegen');
const { ImageError } = require('../services/imagegen/errors');
const { getTargetMedia } = require('./getTargetMedia');

/**
 * The glue between "someone sent a WhatsApp command" and "ask a provider for
 * a picture". Every image command goes through here so prompt handling,
 * the waiting indicator, size presets, and error phrasing behave the same
 * across .genimage, .logo, .poster, .avatar, .wallpaper and .sticker.
 */

// Named size presets, so each command can say what shape it wants without
// repeating pixel numbers. Values are what the major providers accept.
const SIZES = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
  // Phone wallpaper — 9:16-ish, the ratio nearly every modern handset uses.
  phone: { width: 1024, height: 1792 },
  // Desktop wallpaper — 16:9.
  desktop: { width: 1792, height: 1024 },
};

function resolveSize(name) {
  return SIZES[name] || SIZES.square;
}

async function showWorking(ctx) {
  try {
    await ctx.sock.sendPresenceUpdate('composing', ctx.from);
  } catch {
    // Presence is cosmetic — never let it block the actual work.
  }
}

async function stopWorking(ctx) {
  try {
    await ctx.sock.sendPresenceUpdate('paused', ctx.from);
  } catch {
    /* cosmetic */
  }
}

/**
 * Resolves the image a command should act on (attached or replied-to),
 * enforcing the size cap before handing it to a provider.
 *
 * @returns {Promise<{ buffer: Buffer, mimetype: string } | null>}
 *   null after replying with the hint, so callers can just `return`.
 */
async function resolveSourceImage(ctx, { usageHint }) {
  const { sock, msg, reply } = ctx;

  let media;
  try {
    media = await getTargetMedia(sock, msg);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch the target image.');
    await reply('❌ Failed to read that image. The error has been logged.');
    return null;
  }

  if (!media || (media.type !== 'imageMessage' && media.type !== 'stickerMessage')) {
    await reply(usageHint);
    return null;
  }

  const maxBytes = config.imageMaxMB * 1024 * 1024;
  if (media.buffer.length > maxBytes) {
    await reply(
      `⚠️ That image is ${(media.buffer.length / 1024 / 1024).toFixed(1)}MB, ` +
        `over the ${config.imageMaxMB}MB limit.`
    );
    return null;
  }

  return { buffer: media.buffer, mimetype: media.mimetype || 'image/jpeg' };
}

/**
 * Turns an image-layer error into a user-facing reply. Anything that isn't
 * an ImageError is logged and replaced with a generic message, so stack
 * traces and provider URLs never reach a chat.
 */
async function replyWithImageError(ctx, err, context) {
  if (err instanceof ImageError) {
    await ctx.reply(`🎨 ${err.message}`);
    return;
  }
  logger.error({ err }, context || 'An image command failed unexpectedly.');
  await ctx.reply('❌ That image operation failed. The error has been logged.');
}

/**
 * The full "prompt in, picture out" flow used by the text-to-image
 * commands.
 *
 * @param {object} ctx
 * @param {object} options
 * @param {string} options.prompt         final prompt (after any styling)
 * @param {string} [options.size]         a key of SIZES
 * @param {string} [options.caption]      caption for the sent image
 * @param {string} [options.emptyHint]    shown when the prompt is empty
 * @param {Function} [options.send]       custom sender, gets (buffer, result)
 * @returns {Promise<Buffer|null>} the generated image, or null on failure
 */
async function runImageGeneration(ctx, options = {}) {
  const { reply } = ctx;
  const {
    prompt,
    size = 'square',
    caption,
    emptyHint = `Give me something to draw: ${config.prefix}genimage <prompt>`,
    send,
  } = options;

  if (!prompt || !prompt.trim()) {
    await reply(emptyHint);
    return null;
  }

  const status = imageStatus();
  if (!status.ready) {
    await reply(`🎨 ${status.reason}`);
    return null;
  }

  const { width, height } = resolveSize(size);

  await showWorking(ctx);

  let result;
  try {
    result = await generate({ prompt, width, height });
  } catch (err) {
    await replyWithImageError(ctx, err, 'Image generation failed.');
    return null;
  } finally {
    await stopWorking(ctx);
  }

  try {
    if (send) {
      await send(result.buffer, result);
    } else {
      await ctx.sock.sendMessage(
        ctx.from,
        { image: result.buffer, caption: caption ?? undefined },
        { quoted: ctx.msg }
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send a generated image.');
    await reply('❌ The image was generated but could not be sent.');
    return null;
  }

  return result.buffer;
}

module.exports = {
  runImageGeneration,
  resolveSourceImage,
  replyWithImageError,
  showWorking,
  stopWorking,
  resolveSize,
  SIZES,
};
