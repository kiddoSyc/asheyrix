'use strict';

const logger = require('../utils/logger');

/**
 * Shared error plumbing.
 *
 * The rule this codebase follows: an error is either *expected* (the user
 * did something wrong, or an external service said no) or *unexpected* (a
 * bug). Expected errors get a plain message the user can act on. Unexpected
 * ones get logged in full and reduced to a generic line, because a stack
 * trace in a group chat leaks file paths — and sometimes secrets that were
 * in scope when it threw.
 */

/**
 * An error whose message is safe to show a user verbatim.
 * Throw this from a command when the user needs to fix something.
 */
class UserFacingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserFacingError';
    this.userFacing = true;
  }
}

/**
 * Turns any thrown value into something sendable. `id` is a short random
 * tag included in both the log line and the user's message, so when someone
 * reports "it said error a3f9" you can grep straight to it.
 */
function describeError(err, context = {}) {
  const id = Math.random().toString(36).slice(2, 6);

  if (err?.userFacing) {
    logger.info({ ...context, err: err.message }, 'Command rejected with a user-facing error.');
    return `⚠️ ${err.message}`;
  }

  logger.error({ ...context, err, errorId: id }, 'Unexpected error.');
  return `❌ Something went wrong on my side (ref \`${id}\`). It has been logged.`;
}

/**
 * Sends a message and swallows send failures.
 *
 * Send failures are common and mostly not actionable — the socket may be
 * mid-reconnect, or the chat may have been left. What matters is that a
 * failed *reply* never propagates and kills the handler that was trying to
 * apologise for the first failure.
 */
async function safeSend(sock, jid, content, options = {}) {
  try {
    const payload = typeof content === 'string' ? { text: content } : content;
    await sock.sendMessage(jid, payload, options);
    return true;
  } catch (err) {
    logger.error({ err, jid }, 'Failed to send a message.');
    return false;
  }
}

/**
 * Retries an async operation with exponential backoff.
 *
 * Only retries when `shouldRetry` says so — blind retries on a 400-class
 * error just multiply the same failure, and on a *send* they can duplicate
 * a message the user already received.
 *
 * @param {Function} fn                async operation, receives the attempt number
 * @param {object}   [options]
 * @param {number}   [options.attempts=3]
 * @param {number}   [options.baseDelayMs=500]
 * @param {Function} [options.shouldRetry] (err) => boolean
 */
async function withRetry(fn, { attempts = 3, baseDelayMs = 500, shouldRetry, label = 'operation' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      const retryable = shouldRetry ? shouldRetry(err) : Boolean(err?.retryable);
      if (!retryable || attempt === attempts) break;

      // Jitter stops several concurrent failures from retrying in lockstep
      // and hammering an already-struggling service at the same instant.
      const delay = baseDelayMs * 2 ** (attempt - 1);
      const jittered = delay + Math.floor(Math.random() * baseDelayMs);

      logger.warn({ label, attempt, attempts, delay: jittered }, 'Retrying after a failure.');
      await new Promise((resolve) => setTimeout(resolve, jittered));
    }
  }

  throw lastError;
}

/**
 * Wraps an async function so it can never reject. Used at the outermost
 * layer of background handlers, where there's no caller left to catch.
 */
function neverThrow(fn, label) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      logger.error({ err, label }, 'Background task failed (contained).');
      return null;
    }
  };
}

module.exports = { UserFacingError, describeError, safeSend, withRetry, neverThrow };
