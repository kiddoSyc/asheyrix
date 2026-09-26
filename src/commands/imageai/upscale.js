'use strict';

const { config } = require('../../config');
const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { upscaleImage } = require('../../services/media/imageFilters');

module.exports = {
  name: 'upscale',
  aliases: ['hd', 'bigger'],
  description: 'Upscales a replied image (2x by default, up to 4x).',
  category: 'imageai',
  usage: 'upscale [2|3|4] (reply to an image)',
  cooldown: 12,
  async handler(ctx) {
    const requested = Number(ctx.text.trim()) || 2;
    let applied = requested;

    await runMediaCommand(ctx, {
      allowedTypes: ['imageMessage', 'stickerMessage'],
      usageHint: `an image with *${config.prefix}upscale*`,
      inputExt: '.jpg',
      outputExt: '.jpg',
      async convert(inputPath, outputPath) {
        // upscaleImage clamps anything outside 2-4 and reports what it
        // actually used, so the caption never claims a factor that wasn't
        // applied.
        applied = await upscaleImage(inputPath, outputPath, requested);
      },
      async send(buffer) {
        await ctx.sock.sendMessage(
          ctx.from,
          { image: buffer, caption: `🔍 *Upscaled ${applied}x*` },
          { quoted: ctx.msg }
        );
      },
    });
  },
};
