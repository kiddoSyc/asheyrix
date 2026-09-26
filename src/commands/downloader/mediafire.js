'use strict';

const mediafire = require('../../services/downloaders/mediafire');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

module.exports = {
  name: 'mediafire',
  aliases: ['mf'],
  description: 'Downloads a file shared via a MediaFire link.',
  category: 'downloader',
  usage: 'mediafire <url>',
  cooldown: 10,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}mediafire <url>`);
      return;
    }
    await runDownloadCommand(ctx, () => mediafire.download(url));
  },
};
