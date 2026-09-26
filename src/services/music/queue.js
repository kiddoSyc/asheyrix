'use strict';

const { musicSetting } = require('./settings');
const logger = require('../../utils/logger');

/**
 * A tiny FIFO job queue with a concurrency cap.
 *
 * Without it, five people typing `.play` at once would spawn five yt-dlp
 * processes plus five ffmpeg re-encodes on what is usually a small VPS —
 * the sort of thing that gets a bot OOM-killed mid-session. Jobs beyond
 * the limit wait their turn instead.
 */

const MAX_QUEUED = 20;

const waiting = []; // { id, userJid, label, run, resolve, reject, cancelled }
let active = 0;

let nextId = 1;
const running = new Map(); // id -> { userJid, label }

function queueStatus() {
  return { active, waiting: waiting.length, limit: musicSetting('maxConcurrentDownloads') };
}

function pump() {
  const limit = musicSetting('maxConcurrentDownloads');

  while (active < limit && waiting.length > 0) {
    const job = waiting.shift();

    if (job.cancelled) {
      job.reject(Object.assign(new Error('Cancelled.'), { cancelled: true }));
      continue;
    }

    active += 1;
    running.set(job.id, { userJid: job.userJid, label: job.label });

    Promise.resolve()
      .then(() => job.run())
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        running.delete(job.id);
        // Scheduled rather than immediate so a long synchronous tail in the
        // finished job can't starve the event loop before the next starts.
        setImmediate(pump);
      });
  }
}

/**
 * @param {object} options
 * @param {string} options.userJid  who asked — used by .cancel
 * @param {string} options.label    shown in queue messages
 * @param {Function} options.run    async worker
 * @returns {{ promise: Promise<any>, position: number }}
 */
function enqueue({ userJid, label, run }) {
  if (waiting.length >= MAX_QUEUED) {
    return {
      promise: Promise.reject(new Error('The download queue is full — try again in a minute.')),
      position: -1,
    };
  }

  const id = nextId++;
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  waiting.push({ id, userJid, label, run, resolve, reject, cancelled: false });
  const position = waiting.length;

  setImmediate(pump);
  logger.debug({ id, userJid, label, ...queueStatus() }, 'Job queued.');

  return { promise, position };
}

/**
 * Cancels this user's *pending* jobs. A download already running is left
 * alone — killing a half-written temp file mid-write is more trouble than
 * letting it finish and be discarded.
 *
 * @returns {number} how many were cancelled
 */
function cancelForUser(userJid) {
  let cancelled = 0;
  for (let i = waiting.length - 1; i >= 0; i -= 1) {
    if (waiting[i].userJid === userJid) {
      const [job] = waiting.splice(i, 1);
      job.cancelled = true;
      job.reject(Object.assign(new Error('Cancelled.'), { cancelled: true }));
      cancelled += 1;
    }
  }
  return cancelled;
}

function pendingForUser(userJid) {
  return waiting.filter((j) => j.userJid === userJid).length;
}

module.exports = { enqueue, cancelForUser, pendingForUser, queueStatus };
