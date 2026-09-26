'use strict';

const provider = require('../../services/downloaders/pinterest');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

module.exports = {
  name: 'pinterest',
  aliases: ['pint'],
  description: 'Downloads media from a Pinterest pin.',
  category: 'downloader',
  usage: 'pinterest <url>',
  cooldown: 10,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}pinterest <url>`);
      return;
    }
    await runDownloadCommand(ctx, () => provider.downloadVideo(url));
  },
};
