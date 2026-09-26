'use strict';

const provider = require('../../services/downloaders/facebook');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

module.exports = {
  name: 'fb',
  aliases: ['facebook'],
  description: 'Downloads a Facebook video.',
  category: 'downloader',
  usage: 'fb <url>',
  cooldown: 10,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}fb <url>`);
      return;
    }
    await runDownloadCommand(ctx, () => provider.downloadVideo(url));
  },
};
