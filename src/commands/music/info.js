'use strict';

const fs = require('fs');
const music = require('../../services/music');
const { musicEnabled } = require('../../lib/musicCommandHelper');
const { DownloaderError } = require('../../services/downloaders/errors');
const { cleanupTempFile } = require('../../services/downloaders/tempFile');
const logger = require('../../utils/logger');

async function guard(ctx, usage) {
  if (!musicEnabled()) {
    await ctx.reply('🎵 Music features are currently disabled.');
    return false;
  }
  if (!ctx.text.trim()) {
    await ctx.reply(`Usage: ${ctx.config.prefix}${usage}`);
    return false;
  }
  return true;
}

async function withTrack(ctx, usage, fn) {
  if (!(await guard(ctx, usage))) return;
  try {
    const track = await music.resolveTrack(ctx.text.trim());
    await fn(track);
  } catch (err) {
    if (err instanceof DownloaderError) {
      await ctx.reply(`⚠️ ${err.message}`);
      return;
    }
    logger.error({ err }, 'Music info command failed.');
    await ctx.reply('❌ That lookup failed. The error has been logged.');
  }
}

function formatViews(n) {
  if (!n) return 'unknown';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

module.exports = [
  {
    name: 'yts',
    aliases: ['ytsearch'],
    description: 'Searches YouTube and lists the top results.',
    category: 'music',
    usage: 'yts <query>',
    cooldown: 6,
    async handler(ctx) {
      if (!(await guard(ctx, 'yts <query>'))) return;
      try {
        const results = await music.search(ctx.text.trim(), 5);
        if (results.length === 0) {
          await ctx.reply('🔍 No results found.');
          return;
        }
        const lines = results.map(
          (r, i) =>
            `*${i + 1}.* ${r.title}\n   ${r.uploader} • ${music.formatDuration(r.duration)}\n   ${r.url}`
        );
        await ctx.reply(`🔍 *Results*\n\n${lines.join('\n\n')}\n\n_Play one with ${ctx.config.prefix}play <link>_`);
      } catch (err) {
        await ctx.reply(err instanceof DownloaderError ? `⚠️ ${err.message}` : '❌ Search failed.');
      }
    },
  },

  {
    name: 'song',
    aliases: ['songinfo'],
    description: 'Shows information about a song without downloading it.',
    category: 'music',
    usage: 'song <song name or link>',
    cooldown: 6,
    async handler(ctx) {
      await withTrack(ctx, 'song <song name or link>', async (track) => {
        await ctx.reply(
          `🎧 *${track.title}*\n` +
            `👤 ${track.uploader}\n` +
            `⏱️ ${music.formatDuration(track.duration)}\n` +
            `👁️ ${formatViews(track.views)} views\n` +
            `🔗 ${track.url}`
        );
      });
    },
  },

  {
    name: 'musicinfo',
    aliases: ['minfo'],
    description: 'Artist, title, album and duration for a track.',
    category: 'music',
    usage: 'musicinfo <song name or link>',
    cooldown: 6,
    async handler(ctx) {
      await withTrack(ctx, 'musicinfo <song name or link>', async (track) => {
        await ctx.reply(
          `🎼 *Track details*\n\n` +
            `• Title: ${track.title}\n` +
            `• Artist: ${track.artist || track.uploader}\n` +
            `• Album: ${track.album || '—'}\n` +
            `• Duration: ${music.formatDuration(track.duration)}\n` +
            `• Source: ${track.url}`
        );
      });
    },
  },

  {
    name: 'art',
    aliases: ['cover', 'artwork'],
    description: 'Sends the cover art / thumbnail for a song.',
    category: 'music',
    usage: 'art <song name or link>',
    cooldown: 10,
    async handler(ctx) {
      await withTrack(ctx, 'art <song name or link>', async (track) => {
        let filePath = null;
        try {
          const result = await music.downloadThumbnail(track);
          filePath = result.filePath;
          await ctx.sock.sendMessage(
            ctx.from,
            { image: fs.readFileSync(filePath), caption: `🖼️ ${track.title}` },
            { quoted: ctx.msg }
          );
        } finally {
          cleanupTempFile(filePath);
        }
      });
    },
  },

  {
    name: 'lyrics',
    description: 'Finds where to read the lyrics for a song.',
    category: 'music',
    usage: 'lyrics <song name>',
    cooldown: 6,
    async handler(ctx) {
      // Song lyrics are copyrighted text, so this points at the licensed
      // places that have them rather than reproducing them in chat.
      if (!(await guard(ctx, 'lyrics <song name>'))) return;

      const query = ctx.text.trim().slice(0, 120);
      const encoded = encodeURIComponent(`${query} lyrics`);

      await ctx.reply(
        `📝 *Lyrics for:* ${query}\n\n` +
          `I can't reproduce lyrics here — they're copyrighted. These have them legally:\n\n` +
          `• Genius: https://genius.com/search?q=${encodeURIComponent(query)}\n` +
          `• Musixmatch: https://www.musixmatch.com/search/${encodeURIComponent(query)}\n` +
          `• Google: https://www.google.com/search?q=${encoded}\n\n` +
          `_Want the audio instead? ${ctx.config.prefix}play ${query}_`
      );
    },
  },
];
