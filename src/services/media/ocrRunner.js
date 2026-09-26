'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const { MediaError } = require('./errors');
const { makeTempPath, cleanupTempFile } = require('../downloaders/tempFile');

const RUN_TIMEOUT_MS = 30 * 1000;

/**
 * Runs the system `tesseract` binary against an image and returns the
 * extracted text. Same lifecycle pattern as ffmpegRunner: timeout,
 * missing-binary detection, friendly errors instead of a crash.
 */
function runTesseract(imagePath) {
  return new Promise((resolve, reject) => {
    const outBase = makeTempPath(''); // tesseract appends ".txt" itself
    let settled = false;
    const child = spawn('tesseract', [imagePath, outBase, '--psm', '6'], { windowsHide: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      cleanupTempFile(`${outBase}.txt`);
      reject(new MediaError('OCR timed out.', 'TIMEOUT'));
    }, RUN_TIMEOUT_MS);

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(
          new MediaError(
            'tesseract (OCR engine) is not installed on this machine. Ask the bot owner to install it (see README).',
            'TOOL_MISSING'
          )
        );
      } else {
        reject(new MediaError(err.message, 'FAILED'));
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const txtPath = `${outBase}.txt`;
      if (code !== 0 || !fs.existsSync(txtPath)) {
        cleanupTempFile(txtPath);
        reject(new MediaError('OCR failed to read that image.', 'FAILED'));
        return;
      }

      const text = fs.readFileSync(txtPath, 'utf8');
      cleanupTempFile(txtPath);
      resolve(text);
    });
  });
}

module.exports = { runTesseract };
