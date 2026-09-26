'use strict';

class MediaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MediaError';
    this.code = code; // 'TOOL_MISSING' | 'FAILED' | 'TIMEOUT' | 'NO_MEDIA'
  }
}

module.exports = { MediaError };
