'use strict';

const { spawn } = require('child_process');
const { DownloaderError } = require('../downloaders/errors');
const logger = require('../../utils/logger');

const RUN_TIMEOUT_MS = 45 * 1000;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024; // metadata JSON should never be near this

/**
 * Runs yt-dlp in metadata-only mode and parses its JSON output.
 *
 * Kept separate from ytdlpRunner because that module owns *file* downloads
 * (temp paths, size caps, cleanup) and none of that applies here — this
 * only ever produces text on stdout.
 *
 * Arguments are passed as an array to spawn, so nothing from a WhatsApp
 * message is ever interpreted by a shell.
 */
function runYtDlpJson(args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn('yt-dlp', [...args, '--no-warnings', '--no-playlist'], {
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new DownloaderError('Search timed out.', 'TIMEOUT'));
    }, RUN_TIMEOUT_MS);

    let stdout = '';
    let stderr = '';
    let truncated = false;

    child.stdout.on('data', (d) => {
      if (stdout.length > MAX_STDOUT_BYTES) {
        truncated = true;
        return;
      }
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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

      if (code !== 0 || truncated) {
        logger.warn({ stderr: stderr.trim().slice(-300) }, 'yt-dlp metadata lookup failed.');
        reject(new DownloaderError('Could not fetch information for that.', 'FETCH_FAILED'));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new DownloaderError('Got an unreadable response from yt-dlp.', 'FETCH_FAILED'));
      }
    });
  });
}

module.exports = { runYtDlpJson };
