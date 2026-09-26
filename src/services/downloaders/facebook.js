'use strict';

const { buildYtDlpProvider } = require('./ytdlpProviderFactory');

module.exports = buildYtDlpProvider({
  domains: ['facebook.com', 'fb.watch'],
  videoFormatArgs: ['-f', 'best'],
});
