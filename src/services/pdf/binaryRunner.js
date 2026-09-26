'use strict';

const { spawn } = require('child_process');
const { PdfError } = require('./errors');
const logger = require('../../utils/logger');

const DEFAULT_TIMEOUT_MS = 90 * 1000;

/**
 * Runs an external PDF tool, following the same lifecycle contract as
 * ffmpegRunner and ocrRunner: hard timeout, ENOENT surfaced as a
 * TOOL_MISSING error naming the tool, non-zero exit turned into a friendly
 * message with the real stderr logged rather than shown.
 *
 * Unlike those two, callers here are expected to treat TOOL_MISSING as
 * *recoverable* — compression and rasterisation both have a chain of
 * possible backends, and a missing one just means trying the next.
 */
function runBinary(command, args, { timeoutMs = DEFAULT_TIMEOUT_MS, toolLabel = command } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, { windowsHide: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new PdfError(`${toolLabel} timed out.`, 'TIMEOUT'));
    }, timeoutMs);

    let stderr = '';
    child.stderr.on('data', (d) => {
      // Bound this — a broken PDF can make some tools emit warnings in a
      // tight loop, and holding megabytes of that in memory helps nobody.
      if (stderr.length < 8000) stderr += d.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new PdfError(`${toolLabel} is not installed on this machine.`, 'TOOL_MISSING'));
      } else {
        reject(new PdfError(`${toolLabel} failed to start.`, 'FAILED'));
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        logger.warn({ tool: command, stderr: stderr.trim().slice(-500) }, 'PDF tool exited non-zero.');
        reject(new PdfError(`${toolLabel} could not process that PDF.`, 'FAILED'));
        return;
      }

      resolve();
    });
  });
}

module.exports = { runBinary };
