'use strict';

const spotify = require('../../services/downloaders/spotify');
const { DownloaderError } = require('../../services/downloaders/errors');
const logger = require('../../utils/logger');

module.exports = {
  name: 'spotify',
  aliases: ['sp'],
  description: 'Looks up a Spotify link (metadata only), or searches tracks if API credentials are configured.',
  category: 'downloader',
  usage: 'spotify <url or search query>',
  cooldown: 5,
  async handler({ args, reply, config }) {
    const input = args.join(' ');
    if (!input) {
      await reply(`Usage: ${config.prefix}spotify <spotify url>  OR  ${config.prefix}spotify <search query>`);
      return;
    }

    const isUrl = /^https?:\/\//i.test(input);

    try {
      if (isUrl) {
        const meta = await spotify.getMetadata(input);
        await reply(`🎧 *${meta.title}*\n${meta.thumbnail || ''}\n\nNote: this bot never bypasses Spotify's DRM — this is metadata only, not the audio file.`);
        return;
      }

      const results = await spotify.search(input);
      if (results.length === 0) {
        await reply('No results found.');
        return;
      }
      const lines = results.map((r, i) => `${i + 1}. *${r.name}* — ${r.artists}\n   ${r.url}`);
      await reply(`🔎 Spotify search results:\n\n${lines.join('\n\n')}`);
    } catch (err) {
      if (err instanceof DownloaderError) {
        await reply(`⚠️ ${err.message}`);
        return;
      }
      logger.error({ err }, 'Spotify command failed unexpectedly.');
      await reply('❌ Something went wrong. The error has been logged.');
    }
  },
};
