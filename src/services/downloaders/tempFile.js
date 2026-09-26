'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');

const TEMP_DIR = path.resolve(process.cwd(), 'temp');

function ensureTempDir() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Builds a unique path under temp/ for a download to land in. Never
 * collides across concurrent downloads.
 */
function makeTempPath(extension = '') {
  ensureTempDir();
  const name = crypto.randomBytes(8).toString('hex');
  const ext = extension.startsWith('.') ? extension : extension ? `.${extension}` : '';
  return path.join(TEMP_DIR, `${name}${ext}`);
}

/**
 * Deletes a temp file if it exists, swallowing errors — cleanup should
 * never be the thing that crashes a command.
 */
function cleanupTempFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      logger.warn({ err, filePath }, 'Failed to clean up a temp file.');
    }
  });
}

module.exports = { TEMP_DIR, ensureTempDir, makeTempPath, cleanupTempFile };
