'use strict';

const logger = require('./logger');

/**
 * A short-lived cache of View Once media seen on the live upsert stream.
 *
 * Why this exists: a reaction is NOT a reply. When you react to a message,
 * WhatsApp sends the bot only a `reactionMessage` containing the *key* of
 * the target message (chat + id + participant) — no content, no mediaKey,
 * nothing downloadable. So for the emoji trigger to work at all, the bot
 * must have already stashed the original when it first arrived.
 *
 * (The "waw" reply trigger doesn't need this — a reply carries the whole
 * quoted message, decryption key included, which is exactly why it's the
 * more reliable of the two. See viewOnceTriggerHandler.js.)
 */
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_ENTRIES = 300;

const cache = new Map(); // `${remoteJid}:${id}` -> entry

function cacheKey(remoteJid, id) {
  return `${remoteJid}:${id}`;
}

function prune() {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [key, entry] of cache) {
    if (entry.cachedAt < cutoff) cache.delete(key);
  }
  if (cache.size > CACHE_MAX_ENTRIES) {
    const entries = [...cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    for (const [key] of entries.slice(0, cache.size - CACHE_MAX_ENTRIES)) {
      cache.delete(key);
    }
  }
}

/**
 * @param {object} params
 * @param {object} params.key       the original msg.key
 * @param {object} params.inner     flattened View Once content (wrapper stripped)
 * @param {object} params.media     { key, kind } from describeViewOnceMedia
 */
function rememberViewOnce({ key, inner, media }) {
  if (!key?.id || !key?.remoteJid) return;
  cache.set(cacheKey(key.remoteJid, key.id), {
    key,
    inner,
    media,
    senderJid: key.participant || key.remoteJid,
    chatJid: key.remoteJid,
    cachedAt: Date.now(),
  });
  logger.debug({ id: key.id, kind: media?.kind }, 'viewOnceCache: stashed a View Once message.');
}

function recallViewOnce(remoteJid, id) {
  if (!remoteJid || !id) return null;
  const entry = cache.get(cacheKey(remoteJid, id));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(cacheKey(remoteJid, id));
    return null;
  }
  return entry;
}

// Guarded, because registerViewOnceHandler runs again on every reconnect
// and a second interval would sweep the same cache twice for no reason.
let pruneTimer = null;

function startCachePruning() {
  if (pruneTimer) return;
  pruneTimer = setInterval(prune, 5 * 60 * 1000);
  pruneTimer.unref();
}

module.exports = { rememberViewOnce, recallViewOnce, startCachePruning };
