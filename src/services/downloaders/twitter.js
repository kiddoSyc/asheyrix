'use strict';

const { buildYtDlpProvider } = require('./ytdlpProviderFactory');

module.exports = buildYtDlpProvider({
  domains: ['twitter.com', 'x.com'],
  videoFormatArgs: ['-f', 'best'],
});
