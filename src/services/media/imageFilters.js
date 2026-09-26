'use strict';

const { runFfmpeg } = require('./ffmpegRunner');

/**
 * Local image improvement built on ffmpeg, which the bot already depends on
 * for every other media command.
 *
 * Deliberately NOT an API call. `.enhance` and `.upscale` are the two image
 * commands that don't need a model: ffmpeg's Lanczos resampling and unsharp
 * filter cover the common case (a small, soft, over-compressed photo) well
 * enough, they cost nothing, they work offline, and they never send a
 * user's photo to a third party. A diffusion upscaler would hallucinate
 * detail that wasn't there; this only makes the existing pixels cleaner.
 */

// Ceiling on output dimensions. Past this, files get large enough that
// WhatsApp re-compresses them on send and the gain is thrown away anyway.
const MAX_DIMENSION = 4000;

/**
 * Sharpens, lifts contrast slightly, and removes compression noise.
 *
 * The unsharp values are conservative on purpose — aggressive sharpening
 * looks worse than the original on a phone screen, where these images are
 * actually viewed.
 */
async function enhanceImage(inputPath, outputPath) {
  const filters = [
    // Light temporal-free denoise; cleans JPEG blocking without smearing.
    'hqdn3d=1.5:1.5:6:6',
    // luma_msize:luma_amount — 1.2 is a visible but natural sharpen.
    'unsharp=5:5:1.2:5:5:0.0',
    'eq=contrast=1.08:saturation=1.10:brightness=0.01',
  ].join(',');

  await runFfmpeg(['-i', inputPath, '-vf', filters, '-q:v', '2', outputPath]);
}

/**
 * Scales an image up by an integer factor using Lanczos, then sharpens to
 * counteract the softening any resample introduces.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {number} [factor] 2 or 4
 */
async function upscaleImage(inputPath, outputPath, factor = 2) {
  const safeFactor = [2, 3, 4].includes(Number(factor)) ? Number(factor) : 2;

  // The min() keeps the result under MAX_DIMENSION without needing a
  // separate ffprobe call to discover the input size first. -2 on the
  // height keeps it even, which some encoders require.
  const filters = [
    `scale='min(iw*${safeFactor},${MAX_DIMENSION})':-2:flags=lanczos`,
    'unsharp=5:5:0.8:5:5:0.0',
  ].join(',');

  await runFfmpeg(['-i', inputPath, '-vf', filters, '-q:v', '2', outputPath]);

  return safeFactor;
}

/**
 * Converts an image to a 512x512 WebP sticker, padded with transparency
 * rather than cropped so nothing in the picture is cut off.
 *
 * Mirrors the filter used by the existing .sticker command so a generated
 * sticker and a converted one come out identically sized.
 */
async function toSticker(inputPath, outputPath) {
  const filter =
    'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,' +
    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000';

  await runFfmpeg(['-i', inputPath, '-vf', filter, outputPath]);
}

module.exports = { enhanceImage, upscaleImage, toSticker, MAX_DIMENSION };
