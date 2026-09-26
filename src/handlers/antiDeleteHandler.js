'use strict';

const { proto, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { config } = require('../config');
const logger = require('../utils/logger');
const { unwrapMessage, extractText } = require('../utils/messageContent');
const { subscribeToMessages } = require('./messageBus');

// How long a message stays recoverable after being seen. WhatsApp's own
// "delete for everyone" window is a similar order of magnitude, so this
// covers the realistic case without holding data forever.
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const cache = new Map(); // `${remoteJid}:${id}` -> cached entry

function cacheKey(remoteJid, id) {
  return `${remoteJid}:${id}`;
}

function pruneCache() {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [key, entry] of cache) {
    if (entry.cachedAt < cutoff) cache.delete(key);
  }
  if (cache.size > CACHE_MAX_ENTRIES) {
    const entries = [...cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const excess = entries.slice(0, cache.size - CACHE_MAX_ENTRIES);
    for (const [key] of excess) cache.delete(key);
  }
}

function describeMedia(message) {
  if (!message) return null;
  if (message.imageMessage) return { key: 'imageMessage', kind: 'image' };
  if (message.videoMessage) return { key: 'videoMessage', kind: 'video' };
  if (message.audioMessage) return { key: 'audioMessage', kind: 'audio' };
  if (message.stickerMessage) return { key: 'stickerMessage', kind: 'sticker' };
  return null;
}

/**
 * Wires up both halves of anti-delete: caching messages as they arrive, and
 * watching for the "delete for everyone" protocol message that references
 * one of them.
 */
function registerAntiDeleteHandler(sock) {
  subscribeToMessages(({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      handleOne(sock, msg).catch((err) => {
        logger.error({ err }, 'Anti-delete handler failed on a message (skipped, bot kept running).');
      });
    }
  }, { name: 'antiDelete' });

  // Periodic cleanup so the cache can't grow unbounded on a long-running process.
  setInterval(pruneCache, 5 * 60 * 1000).unref();
}

async function handleOne(sock, msg) {
  if (!msg.message) return;
  if (msg.key.remoteJid === 'status@broadcast') return;

  const content = unwrapMessage(msg.message) || msg.message;
  const protocolMessage = content.protocolMessage;
  const isRevoke =
    protocolMessage && protocolMessage.type === proto.Message.ProtocolMessage.Type.REVOKE;

  if (isRevoke) {
    await handleRevoke(sock, msg, protocolMessage);
    return;
  }

  // Not a deletion notice — cache it in case it gets deleted later.
  if (!config.antiDelete) return;

  const key = cacheKey(msg.key.remoteJid, msg.key.id);
  const media = describeMedia(content);
  const entry = {
    cachedAt: Date.now(),
    senderJid: msg.key.participant || msg.key.remoteJid,
    remoteJid: msg.key.remoteJid,
    text: extractText(msg.message),
    media: null,
  };

  if (media) {
    const maxBytes = config.maxDownloadMB * 1024 * 1024;
    const reportedSize = Number(content[media.key]?.fileLength || 0);
    if (!reportedSize || reportedSize <= maxBytes) {
      try {
        const buffer = await downloadMediaMessage(
          { key: msg.key, message: content },
          'buffer',
          {},
          { logger, reuploadRequest: sock.updateMediaMessage }
        );
        entry.media = { kind: media.kind, buffer, mimetype: content[media.key]?.mimetype };
      } catch (err) {
        logger.warn({ err }, 'Anti-delete: could not pre-cache media (will still cache text/metadata).');
      }
    }
  }

  cache.set(key, entry);
}

async function handleRevoke(sock, msg, protocolMessage) {
  if (!config.antiDelete) return;
  if (config.ownerNumbers.length === 0) return;

  const revokedKey = protocolMessage.key;
  if (!revokedKey) return;

  const lookupKey = cacheKey(revokedKey.remoteJid || msg.key.remoteJid, revokedKey.id);
  const entry = cache.get(lookupKey);

  if (!entry) {
    // We never saw the original, or it aged out of the cache — nothing to recover.
    return;
  }

  cache.delete(lookupKey);

  const header =
    `🗑️ *Deleted message recovered*\n` +
    `From: ${entry.senderJid}\n` +
    `Chat: ${entry.remoteJid}`;

  for (const ownerNumber of config.ownerNumbers) {
    const ownerJid = `${ownerNumber}@s.whatsapp.net`;
    try {
      if (entry.media) {
        const caption = `${header}${entry.text ? `\n\n"${entry.text}"` : ''}`;
        const payload =
          entry.media.kind === 'image'
            ? { image: entry.media.buffer, caption }
            : entry.media.kind === 'video'
              ? { video: entry.media.buffer, caption }
              : entry.media.kind === 'sticker'
                ? { sticker: entry.media.buffer }
                : { audio: entry.media.buffer, mimetype: entry.media.mimetype || 'audio/ogg; codecs=opus' };

        await sock.sendMessage(ownerJid, payload);
        if (entry.media.kind === 'sticker' || entry.media.kind === 'audio') {
          await sock.sendMessage(ownerJid, { text: caption });
        }
      } else {
        const text = entry.text
          ? `${header}\n\n"${entry.text}"`
          : `${header}\n\n(no text content — likely an unsupported message type)`;
        await sock.sendMessage(ownerJid, { text });
      }
    } catch (err) {
      logger.error({ err, ownerJid }, 'Failed to forward recovered deleted message to owner.');
    }
  }
}

module.exports = { registerAntiDeleteHandler };
