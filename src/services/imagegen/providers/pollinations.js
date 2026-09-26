'use strict';

const { ImageError, ImageRateLimitError } = require('../errors');

/**
 * Pollinations — a keyless, free image endpoint.
 *
 * This is the default provider for a deliberate reason: the image commands
 * are meant to work for ordinary users, and a default that demands an API
 * key means they work for nobody until the owner sets one up. Pollinations
 * needs no account, so `.genimage` does something useful on a fresh clone.
 *
 * The trade-off is that it's a free public service: slower, rate-limited
 * under load, and lower fidelity than a paid provider. Owners who want
 * better results set IMAGE_PROVIDER to openai/gemini/stability.
 *
 * Generation only — it has no image-editing endpoint, so .editimage and
 * .removebg require a provider that does.
 */

const DEFAULT_BASE_URL = 'https://image.pollinations.ai';

async function generate({ baseUrl, model, prompt, width, height, signal }) {
  const root = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = new URL(`${root}/prompt/${encodeURIComponent(prompt)}`);

  url.searchParams.set('width', String(width));
  url.searchParams.set('height', String(height));
  // Without a seed the service will happily serve a cached image for a
  // repeated prompt, which makes ".genimage" feel broken when someone runs
  // the same prompt twice expecting a different result.
  url.searchParams.set('seed', String(Math.floor(Math.random() * 1_000_000)));
  url.searchParams.set('nologo', 'true');
  if (model) url.searchParams.set('model', model);

  const response = await fetch(url, { signal });

  if (response.status === 429) throw new ImageRateLimitError();
  if (!response.ok) {
    throw new ImageError(`The image service returned an error (HTTP ${response.status}).`, {
      code: 'IMAGE_HTTP',
      retryable: response.status >= 500,
    });
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new ImageError('The image service returned something that was not an image.', {
      code: 'IMAGE_BAD_RESPONSE',
      retryable: true,
    });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new ImageError('The image service returned an empty image.', { code: 'IMAGE_EMPTY', retryable: true });
  }

  return { buffer, mimetype: contentType.split(';')[0] };
}

module.exports = { generate, DEFAULT_BASE_URL };
