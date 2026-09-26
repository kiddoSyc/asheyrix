'use strict';

const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { runFfmpeg } = require('../../services/media/ffmpegRunner');

module.exports = {
  name: 'toimg',
  aliases: ['img'],
  description: 'Converts a replied sticker into a regular image.',
  category: 'media',
  usage: 'toimg (reply to a sticker)',
  cooldown: 5,
  async handler(ctx) {
    await runMediaCommand(ctx, {
      allowedTypes: ['stickerMessage'],
      usageHint: 'a sticker',
      inputExt: '.webp',
      outputExt: '.png',
      async convert(inputPath, outputPath) {
        await runFfmpeg(['-i', inputPath, outputPath]);
      },
      async send(buffer) {
        await ctx.sock.sendMessage(ctx.from, { image: buffer }, { quoted: ctx.msg });
      },
    });
  },
};
