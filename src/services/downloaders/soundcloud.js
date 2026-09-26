'use strict';

const { buildYtDlpProvider } = require('./ytdlpProviderFactory');

module.exports = buildYtDlpProvider({
  domains: ['soundcloud.com'],
  videoFormatArgs: ['-f', 'best'], // unused — SoundCloud is audio-only
  audioFormatArgs: ['-f', 'bestaudio', '-x', '--audio-format', 'mp3'],
});
