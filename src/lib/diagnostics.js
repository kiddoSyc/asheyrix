'use strict';

const { execFile } = require('child_process');
const logger = require('../utils/logger');

function checkBinary(cmd, args = ['--version']) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve({ found: false });
      resolve({ found: true, version: String(stdout).trim().split('\n')[0] });
    });
  });
}

/**
 * Checks for optional external tools the bot can use once installed
 * (yt-dlp for downloaders, ffmpeg for media conversion). Missing tools are
 * logged as warnings, never as fatal errors — the bot still starts and
 * runs fine without them; only the features that need them will decline
 * gracefully at the point of use.
 */
async function runStartupDiagnostics() {
  const [ffmpeg, ytDlp, tesseract] = await Promise.all([
    checkBinary('ffmpeg', ['-version']),
    checkBinary('yt-dlp', ['--version']),
    checkBinary('tesseract', ['--version']),
  ]);

  if (ffmpeg.found) {
    logger.info({ version: ffmpeg.version }, 'ffmpeg detected.');
  } else {
    logger.warn(
      'ffmpeg not found on PATH — media conversion commands (sticker/toaudio/compress, etc.) will decline gracefully until it is installed.'
    );
  }

  if (ytDlp.found) {
    logger.info({ version: ytDlp.version }, 'yt-dlp detected.');
  } else {
    logger.warn(
      'yt-dlp not found on PATH — YouTube/TikTok/Twitter/Facebook/SoundCloud downloaders will decline gracefully until it is installed.'
    );
  }

  if (tesseract.found) {
    logger.info({ version: tesseract.version }, 'tesseract detected.');
  } else {
    logger.warn(
      'tesseract not found on PATH — .ocr will decline gracefully until it is installed.'
    );
  }

  return { ffmpeg, ytDlp, tesseract };
}

module.exports = { runStartupDiagnostics };
