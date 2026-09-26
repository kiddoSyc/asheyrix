'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../../config');
const { TEMP_DIR, ensureTempDir } = require('./tempFile');
const { DownloaderError } = require('./errors');
const logger = require('../../utils/logger');

const RUN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes — generous but bounded

function cleanupByPrefix(basename) {
  try {
    for (const file of fs.readdirSync(TEMP_DIR)) {
      if (file.startsWith(`${basename}.`)) {
        fs.unlink(path.join(TEMP_DIR, file), () => {});
      }
    }
  } catch {
    // TEMP_DIR not readable / doesn't exist yet — nothing to clean up.
  }
}

/**
 * Runs yt-dlp against a URL and resolves with the downloaded file's path
 * and title. `formatArgs` lets each provider module choose audio-only,
 * video, quality caps, etc. without duplicating all the process/timeout/
 * cleanup plumbing here.
 */
function runYtDlp(url, formatArgs = []) {
  return new Promise((resolve, reject) => {
    ensureTempDir();
    const basename = crypto.randomBytes(8).toString('hex');
    const outputTemplate = path.join(TEMP_DIR, `${basename}.%(ext)s`);

    const args = [
      ...formatArgs,
      '--no-playlist',
      '--max-filesize', `${config.maxDownloadMB}M`,
      '--output', outputTemplate,
      '--print', 'after_move:TITLE::%(title)s',
      '--no-warnings',
      url,
    ];

    let settled = false;
    const child = spawn('yt-dlp', args, { windowsHide: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      cleanupByPrefix(basename);
      reject(new DownloaderError('Download timed out.', 'TIMEOUT'));
    }, RUN_TIMEOUT_MS);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanupByPrefix(basename);
      if (err.code === 'ENOENT') {
        reject(
          new DownloaderError(
            'yt-dlp is not installed on this machine. Ask the bot owner to install it (see README).',
            'TOOL_MISSING'
          )
        );
      } else {
        reject(new DownloaderError(err.message, 'FETCH_FAILED'));
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        cleanupByPrefix(basename);
        const tooLarge = /max-filesize|File is larger than/i.test(stderr);
        if (tooLarge) {
          reject(new DownloaderError(`File is over the ${config.maxDownloadMB}MB limit.`, 'TOO_LARGE'));
          return;
        }
        logger.warn({ stderr: stderr.trim().slice(-500) }, 'yt-dlp exited with a non-zero status.');
        reject(
          new DownloaderError(
            'That link could not be downloaded — it may be private, region-locked, or unsupported.',
            'FETCH_FAILED'
          )
        );
        return;
      }

      const titleMatch = stdout.match(/TITLE::(.*)/);
      const title = titleMatch ? titleMatch[1].trim() : 'download';

      let files = [];
      try {
        files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(`${basename}.`));
      } catch (err) {
        reject(new DownloaderError(`Could not read temp directory: ${err.message}`, 'FETCH_FAILED'));
        return;
      }

      if (files.length === 0) {
        reject(new DownloaderError('yt-dlp reported success but no output file was found.', 'FETCH_FAILED'));
        return;
      }

      resolve({ filePath: path.join(TEMP_DIR, files[0]), title });
    });
  });
}

module.exports = { runYtDlp };
