'use strict';

const { ImageError, ImageAuthError, ImageRateLimitError } = require('../errors');

/**
 * remove.bg — a single-purpose background removal API.
 *
 * Kept separate from the generation providers because it's configured
 * separately (its own key, REMOVEBG_API_KEY) and because `.removebg`
 * prefers it over any general image model when a key is present: a model
 * built for exactly this job produces cleaner edges around hair and
 * semi-transparent areas than "please remove the background" ever will.
 */

const ENDPOINT = 'https://api.remove.bg/v1.0/removebg';

async function removeBackground({ apiKey, imageBuffer, mimetype, signal }) {
  const form = new FormData();
  form.append('image_file', new Blob([imageBuffer], { type: mimetype || 'image/png' }), 'source.png');
  form.append('size', 'auto');
  form.append('format', 'png');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: { 'X-Api-Key': apiKey },
    body: form,
  });

  if (response.status === 401 || response.status === 403) throw new ImageAuthError();
  if (response.status === 429) throw new ImageRateLimitError();
  if (response.status === 402) {
    throw new ImageError('The remove.bg account is out of credits.', { code: 'IMAGE_QUOTA' });
  }
  if (!response.ok) {
    throw new ImageError(`Background removal failed (HTTP ${response.status}).`, {
      code: 'IMAGE_HTTP',
      retryable: response.status >= 500,
    });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new ImageError('Background removal returned an empty image.', {
      code: 'IMAGE_EMPTY',
      retryable: true,
    });
  }

  return { buffer, mimetype: 'image/png' };
}

module.exports = { removeBackground, ENDPOINT };
