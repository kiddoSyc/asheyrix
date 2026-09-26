'use strict';

const { AiError, AiRateLimitError, AiAuthError } = require('../errors');

/**
 * Google Gemini (generativelanguage) adapter.
 *
 * Gemini is the odd one out: roles are "user"/"model" rather than
 * "user"/"assistant", the system prompt lives in its own top-level field,
 * and the API key goes in a header rather than a bearer token.
 */

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function toParts(entry) {
  const parts = [];
  for (const image of entry.images || []) {
    parts.push({ inline_data: { mime_type: image.mimetype, data: image.base64 } });
  }
  if (entry.text) parts.push({ text: entry.text });
  return parts;
}

async function send({
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  messages,
  maxTokens,
  temperature,
  signal,
}) {
  const root = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${root}/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: toParts(m),
      })),
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
  });

  if (response.status === 401 || response.status === 403) throw new AiAuthError();
  if (response.status === 429) throw new AiRateLimitError();
  if (!response.ok) {
    throw new AiError(`The AI provider returned an error (HTTP ${response.status}).`, {
      code: 'AI_HTTP',
      retryable: response.status >= 500,
    });
  }

  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) throw new AiError('The AI returned an empty response.', { code: 'AI_EMPTY' });
  return text;
}

module.exports = { send, DEFAULT_BASE_URL, defaultModel: 'gemini-2.0-flash' };
