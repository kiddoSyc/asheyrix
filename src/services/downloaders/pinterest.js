'use strict';

const { buildYtDlpProvider } = require('./ytdlpProviderFactory');

module.exports = buildYtDlpProvider({
  domains: ['pinterest.com', 'pin.it'],
  videoFormatArgs: ['-f', 'best'],
});
