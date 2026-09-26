'use strict';

const { buildYtDlpProvider } = require('./ytdlpProviderFactory');

// TikTok typically serves a single muxed file — no ffmpeg needed.
module.exports = buildYtDlpProvider({
  domains: ['tiktok.com', 'vm.tiktok.com'],
  videoFormatArgs: ['-f', 'best'],
});
