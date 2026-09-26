'use strict';

const { config } = require('../../config');
const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { enhanceImage } = require('../../services/media/imageFilters');

module.exports = {
  name: 'enhance',
  aliases: ['fiximage', 'sharpen'],
  description: 'Cleans up and sharpens a replied image.',
  category: 'imageai',
  usage: 'enhance (reply to an image)',
  cooldown: 10,
  async handler(ctx) {
    // Runs entirely through ffmpeg — no provider, no API key, nothing sent
    // off the machine. See services/media/imageFilters.js for why.
    await runMediaCommand(ctx, {
      allowedTypes: ['imageMessage', 'stickerMessage'],
      usageHint: `an image with *${config.prefix}enhance*`,
      inputExt: '.jpg',
      outputExt: '.jpg',
      async convert(inputPath, outputPath) {
        await enhanceImage(inputPath, outputPath);
      },
      async send(buffer) {
        await ctx.sock.sendMessage(
          ctx.from,
          { image: buffer, caption: '✨ *Enhanced* — denoised, sharpened, contrast lifted.' },
          { quoted: ctx.msg }
        );
      },
    });
  },
};
