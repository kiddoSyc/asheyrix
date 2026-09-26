'use strict';

const direct = require('../../services/downloaders/direct');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

module.exports = {
  name: 'get',
  aliases: ['download'],
  description: 'Downloads a file from a direct URL (image, video, audio, document, etc.).',
  category: 'downloader',
  usage: 'get <url>',
  cooldown: 5,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}get <direct file url>`);
      return;
    }
    await runDownloadCommand(ctx, () => direct.download(url));
  },
};
