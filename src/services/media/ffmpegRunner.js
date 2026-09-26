'use strict';

const { spawn } = require('child_process');
const { MediaError } = require('./errors');
const logger = require('../../utils/logger');

const RUN_TIMEOUT_MS = 90 * 1000;

/**
 * A bad exit code can mean a dozen different things — a genuinely corrupt
 * input, but just as often a missing codec, a missing filter, or a
 * permissions problem, none of which are "the input's fault" and none of
 * which the old one-size-fits-all message let anyone act on. This matches
 * stderr against the handful of causes that are common on a fresh/minimal
 * install (a static ffmpeg build without libwebp, a build without
 * fontconfig/freetype, a read-only temp dir) and returns a message that
 * actually says what to fix. Order matters: more specific patterns first.
 */
const KNOWN_FAILURES = [
  {
    test: /Unknown encoder ['"]?libwebp['"]?/i,
    code: 'TOOL_MISSING',
    message:
      "This ffmpeg build doesn't include WebP support, so it can't create stickers. " +
      'Ask the bot owner to install a full ffmpeg build (Ubuntu/Debian: "apt install ffmpeg" ' +
      'usually already includes it — check with "ffmpeg -encoders | grep webp"; static builds ' +
      'from johnvansickle.com/ffmpeg also work).',
  },
  {
    test: /No such filter: ?['"]?drawtext['"]?/i,
    code: 'TOOL_MISSING',
    message:
      "This ffmpeg build wasn't compiled with text-drawing support (libfreetype/fontconfig), " +
      'so it can\'t render text. Ask the bot owner to install a full ffmpeg build.',
  },
  {
    test: /Cannot (open|load) font (file|face)|error while loading freetype font/i,
    code: 'TOOL_MISSING',
    message: 'The font file ffmpeg tried to use could not be read. Ask the bot owner to check its permissions.',
  },
  {
    test: /Permission denied/i,
    code: 'FAILED',
    message: "ffmpeg couldn't read or write one of its files (permission denied). Ask the bot owner to check folder permissions.",
  },
  {
    test: /No space left on device/i,
    code: 'FAILED',
    message: 'The server has run out of disk space. Ask the bot owner to free some up.',
  },
  {
    test: /Cannot allocate memory/i,
    code: 'FAILED',
    message: 'The server ran out of memory during conversion. Try a smaller file, or ask the bot owner to check available RAM.',
  },
];

function classifyFailure(stderr) {
  for (const failure of KNOWN_FAILURES) {
    if (failure.test.test(stderr)) return failure;
  }
  return null;
}

/**
 * Runs ffmpeg with the given args (input/output paths included). Every
 * media command builds its own args and hands them here — this file owns
 * only the process lifecycle: timeout, missing-binary detection, and
 * translating a bad exit code into a friendly MediaError.
 */
function runFfmpeg(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const spawnOptions = { windowsHide: true };
    if (cwd) spawnOptions.cwd = cwd;
    const child = spawn('ffmpeg', ['-y', ...args], spawnOptions);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new MediaError('Conversion timed out.', 'TIMEOUT'));
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
            'ffmpeg is not installed on this machine. Ask the bot owner to install it (see README).',
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
      if (code !== 0) {
        const trimmedStderr = stderr.trim().slice(-500);
        logger.warn({ stderr: trimmedStderr, args }, 'ffmpeg exited with a non-zero status.');

        const known = classifyFailure(stderr);
        reject(
          known
            ? new MediaError(known.message, known.code)
            : new MediaError('Conversion failed — the input may be corrupted or an unsupported format.', 'FAILED')
        );
        return;
      }
      resolve();
    });
  });
}

module.exports = { runFfmpeg };
