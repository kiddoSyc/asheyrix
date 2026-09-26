'use strict';

class DownloaderError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DownloaderError';
    this.code = code; // 'UNSUPPORTED_URL' | 'TOOL_MISSING' | 'TOO_LARGE' | 'TIMEOUT' | 'FETCH_FAILED'
  }
}

module.exports = { DownloaderError };
