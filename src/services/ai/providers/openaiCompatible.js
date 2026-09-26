'use strict';

const { AiError, AiRateLimitError, AiAuthError } = require('../errors');

/**
 * Adapter for anything speaking the OpenAI /v1/chat/completions dialect.
 *
 * That's a surprisingly large set — OpenAI, Groq, OpenRouter, DeepSeek,
 * Together, Mistral, and most local runtimes (Ollama's OpenAI shim, LM
 * Studio, vLLM) all accept the exact same request body. So rather than
 * writing six near-identical files, the provider registry in ../index.js
 * maps all of them here and only varies `baseUrl` and `defaultModel`.
 */

function toContent(entry) {
  if (!entry.images || entry.images.length === 0) return entry.text;

  const parts = entry.images.map((image) => ({
    type: 'image_url',
    image_url: { url: `data:${image.mimetype};base64,${image.base64}` },
  }));
  if (entry.text) parts.push({ type: 'text', text: entry.text });
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
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const wire = [];
  if (systemPrompt) wire.push({ role: 'system', content: systemPrompt });
  for (const m of messages) wire.push({ role: m.role, content: toContent(m) });

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: wire, max_tokens: maxTokens, temperature }),
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
  const text = (data.choices?.[0]?.message?.content || '').trim();

  if (!text) throw new AiError('The AI returned an empty response.', { code: 'AI_EMPTY' });
  return text;
}

module.exports = { send };
