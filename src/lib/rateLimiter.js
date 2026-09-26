'use strict';

const logger = require('../utils/logger');
const { TtlCache } = require('../utils/ttlCache');

/**
 * Global per-sender rate limiting, on top of the existing per-command
 * cooldowns.
 *
 * Per-command cooldowns stop someone spamming `.sticker` — they do nothing
 * about someone cycling `.joke .fact .dice .8ball .joke` as fast as they can
 * type. In a public group that's a fast route to WhatsApp flagging the
 * account, since from their side it's one number sending dozens of messages
 * a minute to the same chat.
 *
 * So: a sliding window per sender, and a temporary mute for anyone who
 * blows past it repeatedly. The mute is silent by design — telling a
 * spammer they've been muted invites them to test the edges, and it means
 * one more message sent from the bot's number, which is the thing being
 * rationed.
 */

const WINDOW_MS = 60 * 1000;
const MAX_IN_WINDOW = 20; // commands per minute per sender
const STRIKES_BEFORE_MUTE = 3;
const MUTE_MS = 5 * 60 * 1000;

const windows = new TtlCache({ ttlMs: WINDOW_MS * 2, maxEntries: 1000 });
const strikes = new TtlCache({ ttlMs: 30 * 60 * 1000, maxEntries: 1000 });
const muted = new TtlCache({ ttlMs: MUTE_MS, maxEntries: 500 });

/**
 * @returns {{ allowed: boolean, reason?: string, silent?: boolean }}
 */
function checkRateLimit(senderJid) {
  if (muted.has(senderJid)) {
    return { allowed: false, reason: 'muted', silent: true };
  }

  const now = Date.now();
  const recent = (windows.get(senderJid) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  windows.set(senderJid, recent);

  if (recent.length <= MAX_IN_WINDOW) {
    return { allowed: true };
  }

  const strikeCount = (strikes.get(senderJid) || 0) + 1;
  strikes.set(senderJid, strikeCount);

  if (strikeCount >= STRIKES_BEFORE_MUTE) {
    muted.set(senderJid, true);
    logger.warn(
      { senderJid, strikeCount },
      'Sender temporarily muted for sustained command flooding.'
    );
    return { allowed: false, reason: 'muted', silent: true };
  }

  logger.info({ senderJid, count: recent.length, strikeCount }, 'Sender hit the rate limit.');

  // The first couple of strikes get a warning: an ordinary user who just
  // got excited deserves to know why nothing happened.
  return {
    allowed: false,
    reason: 'rate-limited',
    silent: false,
    message: "⏳ You're sending commands faster than I can keep up. Give it a minute.",
  };
}

/** Owners bypass the limiter entirely — see the note in messageHandler. */
function clearLimits(senderJid) {
  windows.delete(senderJid);
  strikes.delete(senderJid);
  muted.delete(senderJid);
}

function limiterStats() {
  return { tracked: windows.size, muted: muted.size };
}

module.exports = { checkRateLimit, clearLimits, limiterStats, MAX_IN_WINDOW };
