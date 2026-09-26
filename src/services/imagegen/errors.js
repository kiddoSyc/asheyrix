'use strict';

/**
 * Errors the image layer raises. Same contract as AiError: every `.message`
 * is safe to show a user verbatim. Provider error bodies routinely echo the
 * request URL (which carries the key for some providers), so raw upstream
 * text is logged and never placed on `.message`.
 */
class ImageError extends Error {
  constructor(message, { code = 'IMAGE_ERROR', retryable = false, cause } = {}) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

class ImageNotConfiguredError extends ImageError {
  constructor(detail) {
    super(detail, { code: 'IMAGE_NOT_CONFIGURED' });
    this.name = 'ImageNotConfiguredError';
  }
}

class ImageUnsupportedError extends ImageError {
  constructor(detail) {
    super(detail, { code: 'IMAGE_UNSUPPORTED' });
    this.name = 'ImageUnsupportedError';
  }
}

class ImageRateLimitError extends ImageError {
  constructor() {
    super('The image provider is rate-limiting requests right now. Try again in a moment.', {
      code: 'IMAGE_RATE_LIMIT',
      retryable: true,
    });
    this.name = 'ImageRateLimitError';
  }
}

class ImageAuthError extends ImageError {
  constructor() {
    super('The image provider rejected the API key. Check IMAGE_API_KEY in your .env.', {
      code: 'IMAGE_AUTH',
    });
    this.name = 'ImageAuthError';
  }
}

class ImageTimeoutError extends ImageError {
  constructor(seconds) {
    super(`The image provider didn't respond within ${seconds}s.`, {
      code: 'IMAGE_TIMEOUT',
      retryable: true,
    });
    this.name = 'ImageTimeoutError';
  }
}

class ImageRejectedError extends ImageError {
  constructor() {
    super("The image provider refused that prompt. Try rewording it.", {
      code: 'IMAGE_REJECTED',
    });
    this.name = 'ImageRejectedError';
  }
}

module.exports = {
  ImageError,
  ImageNotConfiguredError,
  ImageUnsupportedError,
  ImageRateLimitError,
  ImageAuthError,
  ImageTimeoutError,
  ImageRejectedError,
};
