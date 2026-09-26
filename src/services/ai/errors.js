'use strict';

/**
 * Errors the AI layer raises. Every one carries a message that is safe to
 * show a user verbatim — provider responses often embed the API key or
 * internal request ids, so raw upstream text never reaches `.message`.
 */
class AiError extends Error {
  constructor(message, { code = 'AI_ERROR', retryable = false, cause } = {}) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

class AiNotConfiguredError extends AiError {
  constructor(detail) {
    super(detail, { code: 'AI_NOT_CONFIGURED' });
    this.name = 'AiNotConfiguredError';
  }
}

class AiRateLimitError extends AiError {
  constructor() {
    super('The AI provider is rate-limiting requests right now. Try again in a moment.', {
      code: 'AI_RATE_LIMIT',
      retryable: true,
    });
    this.name = 'AiRateLimitError';
  }
}

class AiAuthError extends AiError {
  constructor() {
    super('The AI provider rejected the API key. Check AI_API_KEY in your .env.', {
      code: 'AI_AUTH',
    });
    this.name = 'AiAuthError';
  }
}

class AiTimeoutError extends AiError {
  constructor(seconds) {
    super(`The AI provider didn't respond within ${seconds}s.`, {
      code: 'AI_TIMEOUT',
      retryable: true,
    });
    this.name = 'AiTimeoutError';
  }
}

module.exports = { AiError, AiNotConfiguredError, AiRateLimitError, AiAuthError, AiTimeoutError };
