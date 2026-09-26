'use strict';

const provider = require('../../services/downloaders/twitter');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

module.exports = {
  name: 'twitter',
  aliases: ['x'],
  description: 'Downloads a video from a Twitter/X post.',
  category: 'downloader',
  usage: 'twitter <url>',
  cooldown: 10,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}twitter <url>`);
      return;
    }
    await runDownloadCommand(ctx, () => provider.downloadVideo(url));
  },
};
