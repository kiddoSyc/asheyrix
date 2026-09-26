'use strict';

const {
  ImageError,
  ImageAuthError,
  ImageRateLimitError,
  ImageRejectedError,
} = require('../errors');

/**
 * Google Gemini's image-capable models.
 *
 * Gemini doesn't have a dedicated images endpoint the way OpenAI does —
 * image generation goes through the same generateContent call as text, and
 * the picture comes back as an inlineData part alongside any commentary the
 * model felt like adding. That single-endpoint design means generation and
 * editing differ only by whether a source image is included in the request,
 * so both share one implementation here.
 */

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash-image-preview';

function mapStatus(status) {
  if (status === 401 || status === 403) return new ImageAuthError();
  if (status === 429) return new ImageRateLimitError();
  if (status === 400) return new ImageRejectedError();
  return new ImageError(`The image provider returned an error (HTTP ${status}).`, {
    code: 'IMAGE_HTTP',
    retryable: status >= 500,
  });
}

async function call({ apiKey, baseUrl, model, prompt, imageBuffer, mimetype, signal }) {
  const resolvedModel = model || DEFAULT_MODEL;
  const root = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${root}/models/${resolvedModel}:generateContent`;

  const parts = [];
  // Source image first: the model reads parts in order, and an instruction
  // that follows its subject is interpreted far more reliably than one that
  // precedes it.
  if (imageBuffer) {
    parts.push({
      inlineData: {
        mimeType: mimetype || 'image/png',
        data: imageBuffer.toString('base64'),
      },
    });
  }
  parts.push({ text: prompt });

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      // Header auth rather than ?key= in the query string, so the key can
      // never end up in a proxy log or an error message containing the URL.
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });

  if (!response.ok) throw mapStatus(response.status);

  const data = await response.json();
  const responseParts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = responseParts.find((p) => p.inlineData?.data);

  if (!imagePart) {
    // A text-only answer here almost always means the model declined the
    // request rather than that something broke.
    throw new ImageRejectedError();
  }

  return {
    buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    mimetype: imagePart.inlineData.mimeType || 'image/png',
  };
}

async function generate(params) {
  return call({ ...params, imageBuffer: null });
}

async function edit(params) {
  return call(params);
}

module.exports = { generate, edit, DEFAULT_BASE_URL, DEFAULT_MODEL };
