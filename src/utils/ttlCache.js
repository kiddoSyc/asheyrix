'use strict';

/**
 * A small TTL + size-bounded map.
 *
 * Three separate modules (anti-delete, View Once, message dedup) had each
 * grown their own copy of "Map plus cachedAt plus a prune function that
 * sorts and slices." They behaved subtly differently — one pruned on write,
 * one on a timer, one trimmed half the entries and one trimmed the excess.
 * This is the single implementation they now share.
 *
 * Eviction is O(n log n) on overflow rather than a true O(1) LRU, which is
 * fine at these sizes (hundreds of entries) and keeps the code readable.
 * Pruning is lazy on read plus an optional interval — a long-running bot
 * that goes quiet shouldn't hold a timer open, so the interval is unref'd.
 */
class TtlCache {
  /**
   * @param {object} options
   * @param {number} options.ttlMs       how long an entry stays valid
   * @param {number} options.maxEntries  hard cap before oldest are dropped
   * @param {number} [options.pruneIntervalMs] background sweep; 0 disables
   */
  constructor({ ttlMs, maxEntries, pruneIntervalMs = 5 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();

    if (pruneIntervalMs > 0) {
      this.timer = setInterval(() => this.prune(), pruneIntervalMs);
      // Never keep the process alive just for a cache sweep.
      if (typeof this.timer.unref === 'function') this.timer.unref();
    }
  }

  set(key, value) {
    this.map.set(key, { value, storedAt: Date.now() });
    if (this.map.size > this.maxEntries) this.evictOldest();
    return value;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > this.ttlMs) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }

  evictOldest() {
    const excess = this.map.size - this.maxEntries;
    if (excess <= 0) return;
    const sorted = [...this.map.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
    for (const [key] of sorted.slice(0, excess)) this.map.delete(key);
  }

  prune() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, entry] of this.map) {
      if (entry.storedAt < cutoff) this.map.delete(key);
    }
    this.evictOldest();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}

module.exports = { TtlCache };
