'use strict';

const { URL } = require('url');
const { runYtDlp } = require('./ytdlpRunner');
const { DownloaderError } = require('./errors');

function hostMatches(url, domains) {
  try {
    const { hostname } = new URL(url);
    return domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * Builds a provider module for a yt-dlp-supported platform.
 *
 * @param {string[]} domains - hostnames this provider claims, e.g. ['tiktok.com']
 * @param {string[]} videoFormatArgs - yt-dlp args for video downloads
 * @param {string[]} [audioFormatArgs] - yt-dlp args for audio-only downloads (omit if the platform has no audio mode)
 */
function buildYtDlpProvider({ domains, videoFormatArgs, audioFormatArgs = null }) {
  return {
    test: (url) => hostMatches(url, domains),

    async downloadVideo(url) {
      if (!hostMatches(url, domains)) {
        throw new DownloaderError('This link is not from a supported domain for this command.', 'UNSUPPORTED_URL');
      }
      return runYtDlp(url, videoFormatArgs);
    },

    async downloadAudio(url) {
      if (!audioFormatArgs) {
        throw new DownloaderError('Audio-only download is not available for this platform.', 'UNSUPPORTED_URL');
      }
      if (!hostMatches(url, domains)) {
        throw new DownloaderError('This link is not from a supported domain for this command.', 'UNSUPPORTED_URL');
      }
      return runYtDlp(url, audioFormatArgs);
    },
  };
}

module.exports = { buildYtDlpProvider, hostMatches };
