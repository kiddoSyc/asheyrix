'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const path = require('path');
const { config } = require('../../config');
const { makeTempPath, cleanupTempFile } = require('./tempFile');
const { DownloaderError } = require('./errors');

const FETCH_TIMEOUT_MS = 30 * 1000;
const MAX_REDIRECTS = 5;

function test(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Streams a direct URL to a temp file, enforcing a timeout and a byte-size
 * cap (from config.maxDownloadMB) as it goes — the connection is aborted
 * the instant the cap is exceeded rather than after the fact, so a huge
 * file never fully lands on disk first.
 */
function download(url, { extensionHint = '' } = {}) {
  return new Promise((resolve, reject) => {
    if (!test(url)) {
      reject(new DownloaderError('That does not look like a valid http(s) URL.', 'UNSUPPORTED_URL'));
      return;
    }

    const maxBytes = config.maxDownloadMB * 1024 * 1024;
    let redirectsLeft = MAX_REDIRECTS;

    const attempt = (currentUrl) => {
      const parsed = new URL(currentUrl);
      const client = parsed.protocol === 'http:' ? http : https;

      const req = client.get(currentUrl, { timeout: FETCH_TIMEOUT_MS }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirectsLeft-- <= 0) {
            reject(new DownloaderError('Too many redirects.', 'FETCH_FAILED'));
            return;
          }
          attempt(new URL(res.headers.location, currentUrl).toString());
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new DownloaderError(`Server responded with status ${res.statusCode}.`, 'FETCH_FAILED'));
          return;
        }

        const contentLength = Number(res.headers['content-length'] || 0);
        if (contentLength && contentLength > maxBytes) {
          res.destroy();
          reject(
            new DownloaderError(
              `File is ${(contentLength / 1024 / 1024).toFixed(1)}MB, over the ${config.maxDownloadMB}MB limit.`,
              'TOO_LARGE'
            )
          );
          return;
        }

        const ext = extensionHint || path.extname(parsed.pathname) || '';
        const tempPath = makeTempPath(ext);
        const fileStream = fs.createWriteStream(tempPath);
        let received = 0;

        res.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxBytes) {
            res.destroy();
            fileStream.destroy();
            cleanupTempFile(tempPath);
            reject(
              new DownloaderError(`File exceeded the ${config.maxDownloadMB}MB limit mid-download.`, 'TOO_LARGE')
            );
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          resolve({ filePath: tempPath, contentType: res.headers['content-type'] || '' });
        });

        fileStream.on('error', (err) => {
          cleanupTempFile(tempPath);
          reject(new DownloaderError(`Failed to write file: ${err.message}`, 'FETCH_FAILED'));
        });
      });

      req.on('timeout', () => {
        req.destroy(new DownloaderError('Download timed out.', 'TIMEOUT'));
      });

      req.on('error', (err) => {
        reject(err instanceof DownloaderError ? err : new DownloaderError(err.message, 'FETCH_FAILED'));
      });
    };

    attempt(url);
  });
}

module.exports = { test, download };
