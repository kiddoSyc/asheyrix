'use strict';

const provider = require('../../services/downloaders/instagram');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

module.exports = {
  name: 'ig',
  aliases: ['instagram'],
  description: 'Downloads a public Instagram reel or post (private/rate-limited content may fail).',
  category: 'downloader',
  usage: 'ig <url>',
  cooldown: 10,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}ig <url>`);
      return;
    }
    await runDownloadCommand(ctx, () => provider.downloadVideo(url));
  },
};
