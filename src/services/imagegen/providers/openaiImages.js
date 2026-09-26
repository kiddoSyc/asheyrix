'use strict';

const {
  ImageError,
  ImageAuthError,
  ImageRateLimitError,
  ImageRejectedError,
} = require('../errors');

/**
 * OpenAI's /v1/images endpoints — generation and editing.
 *
 * Note the two endpoints take different content types: generation is plain
 * JSON, editing is multipart/form-data with the source image attached.
 * That asymmetry is why this file builds the edit request by hand with
 * FormData/Blob rather than sharing a single request builder.
 */

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-image-1';

function mapStatus(status) {
  if (status === 401 || status === 403) return new ImageAuthError();
  if (status === 429) return new ImageRateLimitError();
  if (status === 400) return new ImageRejectedError();
  return new ImageError(`The image provider returned an error (HTTP ${status}).`, {
    code: 'IMAGE_HTTP',
    retryable: status >= 500,
  });
}

/**
 * Both endpoints answer with base64 in the same envelope, so unwrapping is
 * shared.
 */
function readImagePayload(data) {
  const entry = data?.data?.[0];
  const b64 = entry?.b64_json;

  if (!b64) {
    throw new ImageError('The image provider returned no image.', {
      code: 'IMAGE_EMPTY',
      retryable: true,
    });
  }

  return { buffer: Buffer.from(b64, 'base64'), mimetype: 'image/png' };
}

async function generate({ apiKey, baseUrl, model, prompt, width, height, signal }) {
  const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/images/generations`;

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      prompt,
      size: `${width}x${height}`,
      n: 1,
    }),
  });

  if (!response.ok) throw mapStatus(response.status);
  return readImagePayload(await response.json());
}

async function edit({ apiKey, baseUrl, model, prompt, imageBuffer, mimetype, signal }) {
  const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/images/edits`;

  const form = new FormData();
  form.append('model', model || DEFAULT_MODEL);
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append(
    'image',
    new Blob([imageBuffer], { type: mimetype || 'image/png' }),
    // The API infers format from the filename extension, so this can't be
    // a bare name.
    mimetype === 'image/jpeg' ? 'source.jpg' : 'source.png'
  );

  const response = await fetch(url, {
    method: 'POST',
    signal,
    // No content-type header here on purpose: fetch must set the multipart
    // boundary itself, and supplying one breaks the request.
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) throw mapStatus(response.status);
  return readImagePayload(await response.json());
}

module.exports = { generate, edit, DEFAULT_BASE_URL, DEFAULT_MODEL };
