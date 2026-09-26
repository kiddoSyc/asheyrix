'use strict';

const { buildYtDlpProvider } = require('./ytdlpProviderFactory');

// Reliability caveat: Instagram frequently requires a logged-in session
// (cookies) for anything beyond public posts, and yt-dlp's coverage here
// shifts often as Instagram changes its API. Public reels/posts usually
// work; private or rate-limited content will fail with a clear error
// rather than a crash.
module.exports = buildYtDlpProvider({
  domains: ['instagram.com'],
  videoFormatArgs: ['-f', 'best'],
});
