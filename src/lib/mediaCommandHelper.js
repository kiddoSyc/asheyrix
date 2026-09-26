'use strict';

const fs = require('fs');
const { getTargetMedia } = require('./getTargetMedia');
const { MediaError } = require('../services/media/errors');
const { makeTempPath, cleanupTempFile } = require('../services/downloaders/tempFile');
const logger = require('../utils/logger');

/**
 * Standard flow for a "reply to media, convert it, send the result" command:
 * - resolves target media (direct attach or reply), replies with a clear
 *   usage hint if nothing usable is found
 * - writes it to a temp input file
 * - hands (inputPath, outputPath, media) to `convert`
 * - sends the converted file via `send(outputBuffer, media)`
 * - ALWAYS cleans up both temp files, success or failure
 */
async function runMediaCommand(
  { sock, msg, reply },
  { allowedTypes, usageHint, inputExt, outputExt, convert, send }
) {
  let media;
  try {
    media = await getTargetMedia(sock, msg);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch target media.');
    await reply('❌ Failed to read that media. The error has been logged.');
    return;
  }

  if (!media || (allowedTypes && !allowedTypes.includes(media.type))) {
    await reply(`Reply to ${usageHint} with this command.`);
    return;
  }

  const resolvedInputExt = typeof inputExt === 'function' ? inputExt(media) : inputExt;
  const resolvedOutputExt = typeof outputExt === 'function' ? outputExt(media) : outputExt;
  const inputPath = makeTempPath(resolvedInputExt);
  const outputPath = makeTempPath(resolvedOutputExt);
  fs.writeFileSync(inputPath, media.buffer);

  try {
    await convert(inputPath, outputPath, media);
    const outBuffer = fs.readFileSync(outputPath);
    await send(outBuffer, media);
  } catch (err) {
    if (err instanceof MediaError) {
      await reply(`⚠️ ${err.message}`);
    } else {
      logger.error({ err }, 'Media command failed unexpectedly.');
      await reply('❌ Conversion failed unexpectedly. The error has been logged.');
    }
  } finally {
    cleanupTempFile(inputPath);
    cleanupTempFile(outputPath);
  }
}

module.exports = { runMediaCommand };
