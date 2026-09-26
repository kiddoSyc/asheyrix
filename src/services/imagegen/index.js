'use strict';

const { config } = require('../../config');
const logger = require('../../utils/logger');
const pollinations = require('./providers/pollinations');
const openaiImages = require('./providers/openaiImages');
const geminiImages = require('./providers/geminiImages');
const stability = require('./providers/stability');
const removeBgProvider = require('./providers/removeBg');
const {
  ImageError,
  ImageNotConfiguredError,
  ImageUnsupportedError,
  ImageTimeoutError,
} = require('./errors');

/**
 * One entry point for every image-producing call in the bot, mirroring how
 * services/ai/index.js fronts the text providers. Commands describe what
 * they want (`generate`, `edit`, `removeBackground`) and this file decides
 * who to call and whether that provider can do it.
 *
 * Adding a provider means adding an entry to PROVIDERS, nothing else.
 */
const PROVIDERS = {
  pollinations: {
    label: 'Pollinations (free, no key)',
    generate: pollinations.generate,
    edit: null, // no editing endpoint
    removeBackground: null,
    baseUrl: pollinations.DEFAULT_BASE_URL,
    defaultModel: '',
    requiresKey: false,
  },
  openai: {
    label: 'OpenAI',
    generate: openaiImages.generate,
    edit: openaiImages.edit,
    removeBackground: null, // approximated via edit, see removeBackground()
    baseUrl: openaiImages.DEFAULT_BASE_URL,
    defaultModel: openaiImages.DEFAULT_MODEL,
    requiresKey: true,
  },
  gemini: {
    label: 'Google Gemini',
    generate: geminiImages.generate,
    edit: geminiImages.edit,
    removeBackground: null,
    baseUrl: geminiImages.DEFAULT_BASE_URL,
    defaultModel: geminiImages.DEFAULT_MODEL,
    requiresKey: true,
  },
  stability: {
    label: 'Stability AI',
    generate: stability.generate,
    edit: stability.edit,
    removeBackground: stability.removeBackground,
    baseUrl: stability.DEFAULT_BASE_URL,
    defaultModel: stability.DEFAULT_MODEL,
    requiresKey: true,
  },
};

function listProviders() {
  return Object.keys(PROVIDERS);
}

/**
 * Resolves the API key for the image provider.
 *
 * The reuse rule: if no dedicated IMAGE_API_KEY is set but the image
 * provider happens to be the same service already configured for text
 * (AI_PROVIDER/AI_API_KEY), that key is used. Someone running
 * AI_PROVIDER=gemini with a Gemini key should get `.genimage` working by
 * setting IMAGE_PROVIDER=gemini and nothing else.
 */
function resolveApiKey(providerName) {
  if (config.imageApiKey) return config.imageApiKey;

  const aiProvider = (config.aiProvider || '').toLowerCase();
  if (aiProvider === providerName && config.aiApiKey) return config.aiApiKey;

  return '';
}

function resolveProvider() {
  const name = (config.imageProvider || '').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new ImageNotConfiguredError(
      `Unknown IMAGE_PROVIDER "${config.imageProvider}". Supported: ${listProviders().join(', ')}.`
    );
  }
  return { name, provider };
}

/**
 * Reports whether image generation is usable and, if not, exactly what's
 * missing — so commands can decline with something actionable.
 */
function imageStatus() {
  let resolved;
  try {
    resolved = resolveProvider();
  } catch (err) {
    return { ready: false, reason: err.message };
  }

  const { name, provider } = resolved;
  const apiKey = resolveApiKey(name);

  if (provider.requiresKey && !apiKey) {
    return {
      ready: false,
      reason:
        `IMAGE_PROVIDER is "${name}", which needs an API key. Set IMAGE_API_KEY in .env, ` +
        'or switch to IMAGE_PROVIDER=pollinations, which needs no key.',
    };
  }

  return {
    ready: true,
    provider: name,
    label: provider.label,
    apiKey,
    baseUrl: config.imageBaseUrl || provider.baseUrl,
    model: config.imageModel || provider.defaultModel,
    capabilities: {
      generate: Boolean(provider.generate),
      edit: Boolean(provider.edit),
      removeBackground: Boolean(provider.removeBackground),
    },
  };
}

/**
 * Wraps a provider call with the timeout and error normalisation every
 * operation needs, so the three public functions below stay readable.
 */
async function withTimeout(operationName, fn) {
  const timeoutSec = config.imageTimeoutSeconds;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  const started = Date.now();

  try {
    const result = await fn(controller.signal);
    logger.info({ operation: operationName, ms: Date.now() - started }, 'Image request completed.');
    return result;
  } catch (err) {
    if (err.name === 'AbortError') throw new ImageTimeoutError(timeoutSec);
    if (err instanceof ImageError) throw err;

    // Network-level failures (DNS, TLS, refused). The raw message can carry
    // the full URL, so it is logged but never surfaced.
    logger.error({ err, operation: operationName }, 'Image request failed at the network level.');
    throw new ImageError("Couldn't reach the image provider. Check the bot's internet connection.", {
      code: 'IMAGE_NETWORK',
      retryable: true,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates an image from a text prompt.
 *
 * @param {object} params
 * @param {string} params.prompt
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @returns {Promise<{ buffer: Buffer, mimetype: string, provider: string }>}
 */
async function generate({ prompt, width = 1024, height = 1024 } = {}) {
  const status = imageStatus();
  if (!status.ready) throw new ImageNotConfiguredError(status.reason);

  if (!prompt || !prompt.trim()) {
    throw new ImageError('No prompt was given.', { code: 'IMAGE_EMPTY_PROMPT' });
  }

  const { provider } = resolveProvider();

  const result = await withTimeout('generate', (signal) =>
    provider.generate({
      apiKey: status.apiKey,
      baseUrl: status.baseUrl,
      model: status.model,
      prompt: prompt.trim(),
      width,
      height,
      signal,
    })
  );

  return { ...result, provider: status.provider };
}

/**
 * Edits an existing image according to a natural-language instruction.
 */
async function edit({ prompt, imageBuffer, mimetype } = {}) {
  const status = imageStatus();
  if (!status.ready) throw new ImageNotConfiguredError(status.reason);

  if (!status.capabilities.edit) {
    throw new ImageUnsupportedError(
      `${status.label} can't edit images — it only generates them. ` +
        'Switch IMAGE_PROVIDER to openai, gemini, or stability for editing.'
    );
  }

  const { provider } = resolveProvider();

  const result = await withTimeout('edit', (signal) =>
    provider.edit({
      apiKey: status.apiKey,
      baseUrl: status.baseUrl,
      model: status.model,
      prompt: prompt.trim(),
      imageBuffer,
      mimetype,
      signal,
    })
  );

  return { ...result, provider: status.provider };
}

/**
 * Removes an image's background, preferring the best available route:
 *
 *   1. remove.bg, if REMOVEBG_API_KEY is set — purpose-built, cleanest edges
 *   2. the configured provider's own background-removal endpoint (Stability)
 *   3. the configured provider's general edit endpoint, prompted for it
 *
 * The third is a genuine fallback rather than an equal option: a general
 * image model asked to remove a background will often reinterpret the
 * subject rather than cut it out cleanly.
 */
async function removeBackground({ imageBuffer, mimetype } = {}) {
  if (config.removeBgApiKey) {
    const result = await withTimeout('removeBackground:remove.bg', (signal) =>
      removeBgProvider.removeBackground({
        apiKey: config.removeBgApiKey,
        imageBuffer,
        mimetype,
        signal,
      })
    );
    return { ...result, provider: 'remove.bg' };
  }

  const status = imageStatus();
  if (!status.ready) throw new ImageNotConfiguredError(status.reason);

  const { provider } = resolveProvider();

  if (status.capabilities.removeBackground) {
    const result = await withTimeout('removeBackground', (signal) =>
      provider.removeBackground({
        apiKey: status.apiKey,
        baseUrl: status.baseUrl,
        imageBuffer,
        mimetype,
        signal,
      })
    );
    return { ...result, provider: status.provider };
  }

  if (status.capabilities.edit) {
    const result = await withTimeout('removeBackground:viaEdit', (signal) =>
      provider.edit({
        apiKey: status.apiKey,
        baseUrl: status.baseUrl,
        model: status.model,
        prompt:
          'Remove the background completely, leaving only the main subject on a fully ' +
          'transparent background. Do not alter, recolour, or redraw the subject itself.',
        imageBuffer,
        mimetype,
        signal,
      })
    );
    return { ...result, provider: status.provider };
  }

  throw new ImageUnsupportedError(
    `${status.label} can't remove backgrounds. Set REMOVEBG_API_KEY in .env, ` +
      'or switch IMAGE_PROVIDER to stability, openai, or gemini.'
  );
}

module.exports = {
  generate,
  edit,
  removeBackground,
  imageStatus,
  listProviders,
  PROVIDERS,
};
