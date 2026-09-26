'use strict';

const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { runFfmpeg } = require('../../services/media/ffmpegRunner');

module.exports = {
  name: 'compress',
  aliases: ['cmp'],
  description: 'Compresses a replied image or video to reduce its file size.',
  category: 'media',
  usage: 'compress (reply to an image/video)',
  cooldown: 10,
  async handler(ctx) {
    await runMediaCommand(ctx, {
      allowedTypes: ['imageMessage', 'videoMessage'],
      usageHint: 'an image or video',
      inputExt: (media) => (media.type === 'videoMessage' ? '.mp4' : '.jpg'),
      outputExt: (media) => (media.type === 'videoMessage' ? '.mp4' : '.jpg'),
      async convert(inputPath, outputPath, media) {
        const args =
          media.type === 'videoMessage'
            ? ['-i', inputPath, '-vcodec', 'libx264', '-crf', '30', '-preset', 'veryfast', '-acodec', 'aac', '-b:a', '96k', outputPath]
            : ['-i', inputPath, '-q:v', '7', outputPath];
        await runFfmpeg(args);
      },
      async send(buffer, media) {
        if (media.type === 'videoMessage') {
          await ctx.sock.sendMessage(ctx.from, { video: buffer, caption: '✅ Compressed' }, { quoted: ctx.msg });
        } else {
          await ctx.sock.sendMessage(ctx.from, { image: buffer, caption: '✅ Compressed' }, { quoted: ctx.msg });
        }
      },
    });
  },
};
