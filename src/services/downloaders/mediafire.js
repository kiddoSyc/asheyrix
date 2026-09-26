'use strict';

const https = require('https');
const { URL } = require('url');
const { download: directDownload } = require('./direct');
const { DownloaderError } = require('./errors');

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new DownloaderError(`MediaFire page responded with status ${res.statusCode}.`, 'FETCH_FAILED'));
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      })
      .on('error', (err) => reject(new DownloaderError(err.message, 'FETCH_FAILED')));
  });
}

function test(url) {
  try {
    return new URL(url).hostname.endsWith('mediafire.com');
  } catch {
    return false;
  }
}

/**
 * MediaFire has no public API — this scrapes the share page's real
 * download button link (a real, stable HTML pattern on their site) and
 * hands the result to the generic direct downloader. If MediaFire changes
 * their page structure, this fails with a clear error rather than a crash.
 */
async function download(url) {
  if (!test(url)) {
    throw new DownloaderError('This is not a MediaFire link.', 'UNSUPPORTED_URL');
  }

  const html = await fetchHtml(url);
  const match = html.match(/href="(https:\/\/download[0-9a-z]*\.mediafire\.com\/[^"]+)"/i);

  if (!match) {
    throw new DownloaderError(
      'Could not find a direct download link on that MediaFire page — it may require manual confirmation or have been removed.',
      'FETCH_FAILED'
    );
  }

  const directUrl = match[1];
  const result = await directDownload(directUrl);
  const title = decodeURIComponent(directUrl.split('/').pop() || 'mediafire-file');
  return { filePath: result.filePath, title };
}

module.exports = { test, download };
