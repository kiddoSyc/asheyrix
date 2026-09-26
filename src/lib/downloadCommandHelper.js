'use strict';

const fs = require('fs');
const path = require('path');
const { cleanupTempFile } = require('../services/downloaders/tempFile');
const { DownloaderError } = require('../services/downloaders/errors');
const logger = require('../utils/logger');

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.webm', '.mov']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.opus', '.ogg', '.wav']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Sends a downloaded file to a chat based on its extension, then ALWAYS
 * cleans up the temp file afterward — whether the send succeeded or not.
 */
async function sendDownloadResult(sock, jid, quotedMsg, { filePath, title }, captionPrefix = '') {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const caption = title ? `${captionPrefix}${title}` : captionPrefix || undefined;
    const buffer = fs.readFileSync(filePath);

    if (VIDEO_EXT.has(ext)) {
      await sock.sendMessage(jid, { video: buffer, caption }, { quoted: quotedMsg });
    } else if (AUDIO_EXT.has(ext)) {
      await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: quotedMsg });
      if (caption) await sock.sendMessage(jid, { text: caption }, { quoted: quotedMsg });
    } else if (IMAGE_EXT.has(ext)) {
      await sock.sendMessage(jid, { image: buffer, caption }, { quoted: quotedMsg });
    } else {
      await sock.sendMessage(
        jid,
        { document: buffer, fileName: path.basename(filePath), caption },
        { quoted: quotedMsg }
      );
    }
  } finally {
    cleanupTempFile(filePath);
  }
}

/**
 * Standard wrapper for downloader commands: runs `downloadFn`, sends the
 * result, and always translates a DownloaderError into a friendly reply
 * instead of the generic "something went wrong" message a raw throw would
 * produce.
 */
async function runDownloadCommand({ reply, sock, from, msg }, downloadFn, captionPrefix = '') {
  let result;
  try {
    result = await downloadFn();
  } catch (err) {
    if (err instanceof DownloaderError) {
      await reply(`⚠️ ${err.message}`);
      return;
    }
    logger.error({ err }, 'Downloader command failed unexpectedly.');
    await reply('❌ Download failed unexpectedly. The error has been logged.');
    return;
  }

  try {
    await sendDownloadResult(sock, from, msg, result, captionPrefix);
  } catch (err) {
    logger.error({ err }, 'Failed to send a downloaded file.');
    await reply('❌ Downloaded the file, but failed to send it. The error has been logged.');
  }
}

module.exports = { sendDownloadResult, runDownloadCommand };
