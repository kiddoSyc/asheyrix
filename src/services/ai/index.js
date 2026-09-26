'use strict';

const { config } = require('../../config');
const logger = require('../../utils/logger');
const anthropic = require('./providers/anthropic');
const gemini = require('./providers/gemini');
const openaiCompatible = require('./providers/openaiCompatible');
const { AiError, AiNotConfiguredError, AiTimeoutError } = require('./errors');

/**
 * One entry point (`ask`) for every AI call in the bot. Commands and
 * handlers never touch a provider module directly — they describe what they
 * want in neutral terms and this file decides who to call.
 *
 * Adding a provider means adding a line to PROVIDERS, nothing else.
 */
const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    send: anthropic.send,
    baseUrl: anthropic.DEFAULT_BASE_URL,
    defaultModel: anthropic.defaultModel,
    supportsVision: true,
  },
  openai: {
    label: 'OpenAI',
    send: openaiCompatible.send,
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    supportsVision: true,
  },
  groq: {
    label: 'Groq',
    send: openaiCompatible.send,
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsVision: false,
  },
  openrouter: {
    label: 'OpenRouter',
    send: openaiCompatible.send,
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    supportsVision: true,
  },
  deepseek: {
    label: 'DeepSeek',
    send: openaiCompatible.send,
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    supportsVision: false,
  },
  gemini: {
    label: 'Google Gemini',
    send: gemini.send,
    baseUrl: gemini.DEFAULT_BASE_URL,
    defaultModel: gemini.defaultModel,
    supportsVision: true,
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    send: openaiCompatible.send,
    baseUrl: '', // must come from AI_BASE_URL
    defaultModel: '',
    supportsVision: true,
  },
};

function listProviders() {
  return Object.keys(PROVIDERS);
}

function resolveProvider() {
  const name = (config.aiProvider || '').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new AiNotConfiguredError(
      `Unknown AI_PROVIDER "${config.aiProvider}". Supported: ${listProviders().join(', ')}.`
    );
  }
  return { name, provider };
}

/**
 * Reports whether AI is usable, and why not if it isn't. Commands call this
 * first so they can decline with something actionable instead of a stack
 * trace.
 */
function aiStatus() {
  if (!config.aiEnabled) {
    return { ready: false, reason: `AI is turned off. Turn it on with ${config.prefix}aichat on.` };
  }
  if (!config.aiApiKey) {
    return { ready: false, reason: 'No AI_API_KEY is set in .env.' };
  }

  let resolved;
  try {
    resolved = resolveProvider();
  } catch (err) {
    return { ready: false, reason: err.message };
  }

  const baseUrl = config.aiBaseUrl || resolved.provider.baseUrl;
  if (!baseUrl) {
    return {
      ready: false,
      reason: 'AI_PROVIDER=custom requires AI_BASE_URL to be set in .env.',
    };
  }

  const model = config.aiModel || resolved.provider.defaultModel;
  if (!model) {
    return { ready: false, reason: 'No AI_MODEL is set and this provider has no default.' };
  }

  return { ready: true, provider: resolved.name, label: resolved.provider.label, model, baseUrl };
}

/**
 * Sends a conversation to the configured provider.
 *
 * @param {object}   params
 * @param {Array}    params.messages      [{ role, text, images? }]
 * @param {string}   [params.systemPrompt] overrides config.aiSystemPrompt
 * @param {number}   [params.maxTokens]
 * @param {number}   [params.temperature]
 * @returns {Promise<string>} the assistant's reply text
 */
async function ask({ messages, systemPrompt, maxTokens, temperature } = {}) {
  const status = aiStatus();
  if (!status.ready) throw new AiNotConfiguredError(status.reason);

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AiError('Nothing to send to the AI.', { code: 'AI_EMPTY_INPUT' });
  }

  const { provider } = resolveProvider();
  const hasImages = messages.some((m) => m.images?.length);
  if (hasImages && !provider.supportsVision) {
    throw new AiError(
      `${status.label} can't read images. Switch AI_PROVIDER to one that can (anthropic, openai, gemini, openrouter).`,
      { code: 'AI_NO_VISION' }
    );
  }

  // A hung provider must never hold a WhatsApp handler open forever.
  const timeoutSec = config.aiTimeoutSeconds;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

  const started = Date.now();
  try {
    const text = await provider.send({
      apiKey: config.aiApiKey,
      baseUrl: status.baseUrl,
      model: status.model,
      systemPrompt: systemPrompt ?? config.aiSystemPrompt,
      messages,
      maxTokens: maxTokens ?? config.aiMaxTokens,
      temperature: temperature ?? config.aiTemperature,
      signal: controller.signal,
    });

    logger.info(
      { provider: status.provider, model: status.model, ms: Date.now() - started, turns: messages.length },
      'AI request completed.'
    );
    return text;
  } catch (err) {
    if (err.name === 'AbortError') throw new AiTimeoutError(timeoutSec);
    if (err instanceof AiError) throw err;

    // Network-level failures (DNS, TLS, refused) land here. The raw message
    // can contain the full URL, so it's logged but not surfaced.
    logger.error({ err, provider: status.provider }, 'AI request failed at the network level.');
    throw new AiError("Couldn't reach the AI provider. Check the bot's internet connection.", {
      code: 'AI_NETWORK',
      retryable: true,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { ask, aiStatus, listProviders, PROVIDERS };
