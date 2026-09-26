'use strict';

const youtube = require('../../services/downloaders/youtube');
const { runDownloadCommand } = require('../../lib/downloadCommandHelper');

const ytmp3 = {
  name: 'ytmp3',
  aliases: ['yta'],
  description: 'Downloads audio from a YouTube link as mp3.',
  category: 'downloader',
  usage: 'ytmp3 <youtube url>',
  cooldown: 10,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}ytmp3 <youtube url>`);
      return;
    }
    await runDownloadCommand(ctx, () => youtube.downloadAudio(url), '🎵 ');
  },
};

const ytmp4 = {
  name: 'ytmp4',
  aliases: ['ytv'],
  description: 'Downloads a YouTube video (capped at 480p to keep file size reasonable).',
  category: 'downloader',
  usage: 'ytmp4 <youtube url>',
  cooldown: 15,
  async handler(ctx) {
    const { args, reply } = ctx;
    const url = args[0];
    if (!url) {
      await reply(`Usage: ${ctx.config.prefix}ytmp4 <youtube url>`);
      return;
    }
    await runDownloadCommand(ctx, () => youtube.downloadVideo(url), '🎬 ');
  },
};

module.exports = [ytmp3, ytmp4];
