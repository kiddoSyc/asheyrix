'use strict';

const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { runFfmpeg } = require('../../services/media/ffmpegRunner');

module.exports = {
  name: 'tomp4',
  aliases: ['mp4'],
  description: 'Converts a replied video (e.g. .mov/.webm/.mkv) into a standard mp4.',
  category: 'media',
  usage: 'tomp4 (reply to a video)',
  cooldown: 10,
  async handler(ctx) {
    await runMediaCommand(ctx, {
      allowedTypes: ['videoMessage'],
      usageHint: 'a video',
      inputExt: '.bin',
      outputExt: '.mp4',
      async convert(inputPath, outputPath) {
        await runFfmpeg(['-i', inputPath, '-c:v', 'libx264', '-c:a', 'aac', outputPath]);
      },
      async send(buffer) {
        await ctx.sock.sendMessage(ctx.from, { video: buffer }, { quoted: ctx.msg });
      },
    });
  },
};
