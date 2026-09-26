'use strict';

const {
  ImageError,
  ImageAuthError,
  ImageRateLimitError,
  ImageRejectedError,
} = require('../errors');

/**
 * Stability AI's v2beta endpoints.
 *
 * Worth having alongside OpenAI and Gemini because Stability exposes a
 * dedicated background-removal endpoint, which the other two only
 * approximate by asking a general image model nicely. When this provider is
 * configured, `.removebg` gets a purpose-built model instead of a prompt.
 *
 * All three endpoints here return raw image bytes (not base64 in JSON) when
 * asked with `accept: image/*`, which keeps the response handling simple.
 */

const DEFAULT_BASE_URL = 'https://api.stability.ai/v2beta';
const DEFAULT_MODEL = 'core';

function mapStatus(status) {
  if (status === 401 || status === 403) return new ImageAuthError();
  if (status === 429) return new ImageRateLimitError();
  if (status === 400 || status === 422) return new ImageRejectedError();
  return new ImageError(`The image provider returned an error (HTTP ${status}).`, {
    code: 'IMAGE_HTTP',
    retryable: status >= 500,
  });
}

async function readImageResponse(response) {
  if (!response.ok) throw mapStatus(response.status);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new ImageError('The image provider returned an empty image.', {
      code: 'IMAGE_EMPTY',
      retryable: true,
    });
  }

  return { buffer, mimetype: response.headers.get('content-type')?.split(';')[0] || 'image/png' };
}

/**
 * Stability takes an aspect ratio from a fixed list rather than pixel
 * dimensions, so the requested size is matched to the closest supported
 * ratio instead of being passed through.
 */
const SUPPORTED_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:5', value: 4 / 5 },
  { label: '5:4', value: 5 / 4 },
  { label: '21:9', value: 21 / 9 },
  { label: '9:21', value: 9 / 21 },
];

function closestAspectRatio(width, height) {
  const target = width / height;
  return SUPPORTED_RATIOS.reduce((best, candidate) =>
    Math.abs(candidate.value - target) < Math.abs(best.value - target) ? candidate : best
  ).label;
}

async function generate({ apiKey, baseUrl, model, prompt, width, height, signal }) {
  const root = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${root}/stable-image/generate/${model || DEFAULT_MODEL}`;

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'png');
  form.append('aspect_ratio', closestAspectRatio(width, height));

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${apiKey}`, accept: 'image/*' },
    body: form,
  });

  return readImageResponse(response);
}

async function edit({ apiKey, baseUrl, prompt, imageBuffer, mimetype, signal }) {
  const root = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${root}/stable-image/edit/search-and-replace`;

  const form = new FormData();
  form.append('image', new Blob([imageBuffer], { type: mimetype || 'image/png' }), 'source.png');
  form.append('prompt', prompt);
  form.append('output_format', 'png');

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${apiKey}`, accept: 'image/*' },
    body: form,
  });

  return readImageResponse(response);
}

async function removeBackground({ apiKey, baseUrl, imageBuffer, mimetype, signal }) {
  const root = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${root}/stable-image/edit/remove-background`;

  const form = new FormData();
  form.append('image', new Blob([imageBuffer], { type: mimetype || 'image/png' }), 'source.png');
  // PNG keeps the alpha channel the whole operation exists to produce.
  form.append('output_format', 'png');

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${apiKey}`, accept: 'image/*' },
    body: form,
  });

  return readImageResponse(response);
}

module.exports = { generate, edit, removeBackground, DEFAULT_BASE_URL, DEFAULT_MODEL };
