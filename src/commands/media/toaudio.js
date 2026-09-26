'use strict';

const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { runFfmpeg } = require('../../services/media/ffmpegRunner');

module.exports = {
  name: 'toaudio',
  aliases: ['ta'],
  description: 'Extracts the audio track from a replied video, in its original quality (aac/m4a).',
  category: 'media',
  usage: 'toaudio (reply to a video)',
  cooldown: 8,
  async handler(ctx) {
    await runMediaCommand(ctx, {
      allowedTypes: ['videoMessage'],
      usageHint: 'a video',
      inputExt: '.mp4',
      outputExt: '.m4a',
      async convert(inputPath, outputPath) {
        await runFfmpeg(['-i', inputPath, '-vn', '-acodec', 'aac', '-b:a', '192k', outputPath]);
      },
      async send(buffer) {
        await ctx.sock.sendMessage(ctx.from, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: ctx.msg });
      },
    });
  },
};
