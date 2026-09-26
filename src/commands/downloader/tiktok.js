'use strict';

const provider = require('../../services/downloaders/tiktok');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

module.exports = {
  name: 'tiktok',
  aliases: ['tt'],
  description: 'Downloads a TikTok video (no watermark, where supported).',
  category: 'downloader',
  usage: 'tiktok <url>',
  cooldown: 10,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}tiktok <url>`);
      return;
    }
    await runDownloadCommand(ctx, () => provider.downloadVideo(url));
  },
};
