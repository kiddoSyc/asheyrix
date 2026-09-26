'use strict';

const { config } = require('../../config');
const { TtlCache } = require('../../utils/ttlCache');

/**
 * Per-chat conversation memory for the AI.
 *
 * Scoped by chat JID *and* sender, so two people talking to the bot in the
 * same group get separate threads rather than reading each other's context.
 * In a DM the two collapse to the same value, which is what you'd want.
 *
 * Deliberately in-memory only: this is a chat history, some of it private,
 * and writing it to disk would mean it outlives the process and ends up in
 * backups. A restart clearing everyone's context is the safer default.
 *
 * Images are never stored in history — only the turn's text. Keeping base64
 * media in memory across turns would balloon usage for no real benefit,
 * since the model has already described what it saw in its own reply.
 */
const threads = new TtlCache({
  ttlMs: 60 * 60 * 1000, // an hour of silence ends the thread
  maxEntries: 200,
});

function threadKey(chatJid, senderJid) {
  return `${chatJid}::${senderJid}`;
}

function getHistory(chatJid, senderJid) {
  return threads.get(threadKey(chatJid, senderJid)) || [];
}

/**
 * Appends a completed exchange and trims to the configured window.
 * The window counts *turns* (a user message plus its reply = 2 entries).
 */
function remember(chatJid, senderJid, { userText, assistantText }) {
  const key = threadKey(chatJid, senderJid);
  const history = threads.get(key) || [];

  history.push({ role: 'user', text: userText });
  history.push({ role: 'assistant', text: assistantText });

  const maxEntries = Math.max(2, config.aiMaxHistory * 2);
  const trimmed = history.slice(-maxEntries);

  threads.set(key, trimmed);
  return trimmed;
}

function clearThread(chatJid, senderJid) {
  return threads.delete(threadKey(chatJid, senderJid));
}

function clearAll() {
  const count = threads.size;
  threads.clear();
  return count;
}

function activeThreadCount() {
  return threads.size;
}

module.exports = { getHistory, remember, clearThread, clearAll, activeThreadCount };
