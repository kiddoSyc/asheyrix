'use strict';

const fs = require('fs');
const music = require('../services/music');
const { musicSetting } = require('../services/music/settings');
const { enqueue, queueStatus } = require('../services/music/queue');
const { DownloaderError } = require('../services/downloaders/errors');
const { cleanupTempFile } = require('../services/downloaders/tempFile');
const musicStore = require('../database/musicStore');
const logger = require('../utils/logger');

/**
 * The whole `.play` pipeline in one place: resolve → queue → download →
 * send → clean up. `.play`, `.playvn` and the automatic link handler all
 * call it, so size limits, cleanup and error phrasing can't drift apart
 * between them.
 */

function musicEnabled() {
  return Boolean(musicSetting('enabled'));
}

/**
 * @param {object} ctx        command context
 * @param {string} input      a search phrase or a YouTube URL
 * @param {object} [options]
 * @param {boolean} [options.asVoiceNote]
 * @param {string}  [options.quality]
 */
async function playTrack(ctx, input, options = {}) {
  const { reply, sock, from, sender, msg } = ctx;

  if (!musicEnabled()) {
    await reply('🎵 Music features are currently disabled.');
    return;
  }

  const query = String(input || '').trim();
  if (!query) {
    await reply(`Usage: ${ctx.config.prefix}play <song name or YouTube link>`);
    return;
  }

  const quality = options.quality || musicStore.getQuality(sender) || musicSetting('defaultQuality');

  let track;
  try {
    track = await music.resolveTrack(query);
  } catch (err) {
    await reply(err instanceof DownloaderError ? `⚠️ ${err.message}` : '❌ Search failed.');
    return;
  }

  const status = queueStatus();
  const queuedNote = status.active >= status.limit ? '\n_Queued — I\'ll send it shortly._' : '';
  await reply(
    `🎵 *${track.title}*\n` +
      `👤 ${track.uploader}\n` +
      `⏱️ ${music.formatDuration(track.duration)}  •  quality: ${quality}${queuedNote}`
  );

  const { promise } = enqueue({
    userJid: sender,
    label: track.title,
    run: () => music.downloadAudio(track, quality),
  });

  let result;
  try {
    result = await promise;
  } catch (err) {
    if (err.cancelled) return; // .cancel already told them
    if (err instanceof DownloaderError) {
      await reply(`⚠️ ${err.message}`);
      return;
    }
    logger.error({ err }, 'Music download failed.');
    await reply('❌ Download failed. The error has been logged.');
    return;
  }

  let voicePath = null;
  try {
    if (options.asVoiceNote) {
      voicePath = await music.toVoiceNote(result.filePath);
      await sock.sendMessage(
        from,
        { audio: fs.readFileSync(voicePath), mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        from,
        {
          audio: fs.readFileSync(result.filePath),
          mimetype: 'audio/mpeg',
          fileName: `${track.title.slice(0, 60).replace(/[\\/:*?"<>|]/g, '')}.mp3`,
        },
        { quoted: msg }
      );
    }

    musicStore.addHistory(sender, { title: track.title, url: track.url });
  } catch (err) {
    logger.error({ err }, 'Failed to send a music file.');
    await reply('❌ Downloaded it, but sending failed.');
  } finally {
    // Temp files go whether the send worked or not — a full disk is a
    // worse failure than a missing song.
    cleanupTempFile(result.filePath);
    cleanupTempFile(voicePath);
  }
}

module.exports = { playTrack, musicEnabled };
