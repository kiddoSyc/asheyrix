'use strict';

const logger = require('../utils/logger');

/**
 * One `messages.upsert` listener, fanned out to every subscriber.
 *
 * Before this, seven modules each attached their own listener to the same
 * event. That's not just tidiness — it had real costs:
 *
 *   • Baileys' EventEmitter re-ran the whole payload through seven separate
 *     callbacks, and six of them immediately discarded most of it.
 *   • Every one of them independently re-checked `type !== 'notify'` and
 *     re-unwrapped the same ephemeral/edited envelopes, so identical work
 *     happened seven times per message.
 *   • A subscriber that threw synchronously (before its own try/catch) took
 *     down the emit for everyone registered after it.
 *   • Node warns at ten listeners on one event, and we were at seven with
 *     more planned.
 *
 * Now the envelope is unwrapped once, the `notify` filter is applied once,
 * and each subscriber is isolated so one throwing can't starve the rest.
 *
 * Subscribers keep the same callback shape they had before — `({ messages,
 * type })` — so this was a drop-in change at each call site.
 */

// Keyed by name, not a plain list, and that detail matters: every
// register*Handler runs again on each reconnect, because they close over
// `sock`. With an array they'd stack up and a message would be handled twice
// after the first drop, four times after the second. Re-registering the same
// name replaces the old closure instead, which is exactly the behaviour the
// per-socket listeners gave us for free before.
const subscribers = new Map(); // name -> fn

function subscribeToMessages(fn, { name } = {}) {
  if (!name) throw new Error('subscribeToMessages requires a name so reconnects can replace it.');

  if (subscribers.has(name)) {
    logger.debug({ name }, 'Replacing an existing message subscriber (likely a reconnect).');
  }
  subscribers.set(name, fn);

  return () => subscribers.delete(name);
}

/**
 * Attaches the single real listener. Called once per socket, so a reconnect
 * rebinds cleanly without duplicating subscribers (they live on this module,
 * not on the socket).
 */
function attachMessageBus(sock) {
  sock.ev.on('messages.upsert', (payload) => {
    for (const [name, fn] of subscribers) {
      try {
        // Subscribers are sync-returning by contract; anything async inside
        // them is their own responsibility to catch. This guard is for the
        // synchronous throw that would otherwise abort the whole fan-out.
        const result = fn(payload);
        if (result && typeof result.catch === 'function') {
          result.catch((err) => {
            logger.error({ err, subscriber: name }, 'Message subscriber rejected.');
          });
        }
      } catch (err) {
        logger.error({ err, subscriber: name }, 'Message subscriber threw — others still ran.');
      }
    }
  });

  logger.debug({ subscribers: subscribers.size }, 'Message bus attached to socket.');
}

function subscriberCount() {
  return subscribers.size;
}

/**
 * Clears every subscriber. Only used between full restarts in tests — a
 * reconnect must NOT call this, or the bot comes back deaf.
 */
function resetSubscribers() {
  subscribers.clear();
}

module.exports = { subscribeToMessages, attachMessageBus, subscriberCount, resetSubscribers };
