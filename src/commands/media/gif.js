'use strict';

const { runMediaCommand } = require('../../lib/mediaCommandHelper');
const { runFfmpeg } = require('../../services/media/ffmpegRunner');

// WhatsApp doesn't really support standalone animated .gif files well — the
// standard trick (used by essentially every WA bot) is to send a short
// looping mp4 with the `gifPlayback` flag, which WhatsApp clients render
// and autoplay like a gif.
module.exports = {
  name: 'gif',
  aliases: [],
  description: 'Converts a replied short video into a looping gif-style clip.',
  category: 'media',
  usage: 'gif (reply to a short video)',
  cooldown: 10,
  async handler(ctx) {
    await runMediaCommand(ctx, {
      allowedTypes: ['videoMessage'],
      usageHint: 'a short video',
      inputExt: '.mp4',
      outputExt: '.mp4',
      async convert(inputPath, outputPath) {
        await runFfmpeg([
          '-i', inputPath,
          '-t', '8',
          '-vf', 'fps=15,scale=480:-1:flags=lanczos',
          '-an',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          outputPath,
        ]);
      },
      async send(buffer) {
        await ctx.sock.sendMessage(ctx.from, { video: buffer, gifPlayback: true }, { quoted: ctx.msg });
      },
    });
  },
};
