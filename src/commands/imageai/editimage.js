'use strict';

const { config } = require('../../config');
const { edit } = require('../../services/imagegen');
const {
  resolveSourceImage,
  replyWithImageError,
  showWorking,
  stopWorking,
} = require('../../lib/imageCommandHelper');
const logger = require('../../utils/logger');

module.exports = {
  name: 'editimage',
  aliases: ['imgedit', 'aiedit'],
  description: 'Edits a replied image following an instruction.',
  category: 'imageai',
  usage: 'editimage <instruction> (reply to an image)',
  cooldown: 20,
  async handler(ctx) {
    const { reply } = ctx;
    const instruction = ctx.text.trim();

    if (!instruction) {
      await reply(
        `Reply to an image and say what to change:\n` +
          `*${config.prefix}editimage make the sky stormy and add rain*`
      );
      return;
    }

    const source = await resolveSourceImage(ctx, {
      usageHint: `Reply to an image with *${config.prefix}editimage <instruction>*.`,
    });
    if (!source) return;

    await showWorking(ctx);

    let result;
    try {
      result = await edit({
        prompt: instruction,
        imageBuffer: source.buffer,
        mimetype: source.mimetype,
      });
    } catch (err) {
      await replyWithImageError(ctx, err, 'Image edit failed.');
      return;
    } finally {
      await stopWorking(ctx);
    }

    try {
      await ctx.sock.sendMessage(
        ctx.from,
        { image: result.buffer, caption: `✏️ *Edited* — ${instruction}` },
        { quoted: ctx.msg }
      );
    } catch (err) {
      logger.error({ err }, 'Failed to send an edited image.');
      await reply('❌ The edit worked but the image could not be sent.');
    }
  },
};
