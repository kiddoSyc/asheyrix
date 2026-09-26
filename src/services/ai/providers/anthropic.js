'use strict';

const { AiError, AiRateLimitError, AiAuthError } = require('../errors');

/**
 * Anthropic Messages API adapter.
 *
 * The provider contract (shared by every file in this folder) is:
 *   send({ apiKey, baseUrl, model, systemPrompt, messages, maxTokens,
 *          temperature, signal }) -> Promise<string>
 *
 * `messages` arrives in a neutral shape:
 *   { role: 'user' | 'assistant', text: string, images?: [{ mimetype, base64 }] }
 * Each adapter is responsible for translating that into its own wire format,
 * so nothing above this layer knows which provider is in use.
 */

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

function toContent(entry) {
  const parts = [];
  for (const image of entry.images || []) {
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mimetype, data: image.base64 },
    });
  }
  if (entry.text) parts.push({ type: 'text', text: entry.text });
  return parts.length === 1 && parts[0].type === 'text' ? entry.text : parts;
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
  const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: messages.map((m) => ({ role: m.role, content: toContent(m) })),
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

  // A response can interleave several content blocks; only text is useful here.
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new AiError('The AI returned an empty response.', { code: 'AI_EMPTY' });
  return text;
}

module.exports = { send, DEFAULT_BASE_URL, defaultModel: 'claude-sonnet-4-6' };
