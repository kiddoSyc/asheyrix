'use strict';

const soundcloud = require('../../services/downloaders/soundcloud');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

module.exports = {
  name: 'soundcloud',
  aliases: ['sc'],
  description: 'Downloads a track from SoundCloud as mp3.',
  category: 'downloader',
  usage: 'soundcloud <url>',
  cooldown: 10,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}soundcloud <url>`);
      return;
    }
    await runDownloadCommand(ctx, () => soundcloud.downloadAudio(url), '🎵 ');
  },
};
