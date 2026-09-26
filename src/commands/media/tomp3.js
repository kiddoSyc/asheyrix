'use strict';

const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { runFfmpeg } = require('../../services/media/ffmpegRunner');

module.exports = {
  name: 'tomp3',
  aliases: ['mp3'],
  description: 'Converts a replied video or audio message to mp3.',
  category: 'media',
  usage: 'tomp3 (reply to a video/audio)',
  cooldown: 8,
  async handler(ctx) {
    await runMediaCommand(ctx, {
      allowedTypes: ['videoMessage', 'audioMessage'],
      usageHint: 'a video or audio message',
      inputExt: (media) => (media.type === 'videoMessage' ? '.mp4' : '.ogg'),
      outputExt: '.mp3',
      async convert(inputPath, outputPath) {
        await runFfmpeg(['-i', inputPath, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '192k', outputPath]);
      },
      async send(buffer) {
        await ctx.sock.sendMessage(ctx.from, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: ctx.msg });
      },
    });
  },
};
