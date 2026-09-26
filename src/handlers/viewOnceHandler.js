'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { config } = require('../config');
const logger = require('../utils/logger');
const { extractViewOnceContent, describeViewOnceMedia: describeMedia } = require('../utils/viewOnce');
const { rememberViewOnce, startCachePruning } = require('../utils/viewOnceCache');
const { subscribeToMessages } = require('./messageBus');

/**
 * Wires up View Once capture on a socket. Runs on every message regardless
 * of prefix — View Once media is never going to look like a command.
 *
 * NOTE: as of the June 2024 WhatsApp protocol change, Baileys is often only
 * handed the decryption key for View Once media when the client explicitly
 * replies to it — a fresh incoming upsert frequently arrives without enough
 * to download. When that happens this background handler will simply fail
 * to capture the media (logged, not fatal); the reliable fallback is the
 * manual ".vv" command (see commands/privacy/vv.js), which works by reading
 * the quoted message produced by actually replying to the View Once media.
 */
function registerViewOnceHandler(sock) {
  subscribeToMessages(({ messages, type }) => {
    logger.debug(
      { type, count: messages.length, antiViewOnce: config.antiViewOnce },
      'viewOnceHandler received a message batch.'
    );

    if (type !== 'notify') {
      logger.debug({ type }, 'viewOnceHandler: skipped batch (not a "notify" event).');
      return;
    }
    if (config.ownerNumbers.length === 0) return;

    // Process the batch concurrently, not one-at-a-time — a slow media
    // download for message #1 must never delay message #2.
    for (const msg of messages) {
      handleOne(sock, msg).catch((err) => {
        logger.error({ err }, 'View Once handler failed on a message (skipped, bot kept running).');
      });
    }
  }, { name: 'viewOnce' });

  startCachePruning();
}

async function handleOne(sock, msg) {
  if (!msg.message) {
    logger.debug({ id: msg.key?.id }, 'viewOnceHandler: message had no content (protocol/reaction/etc), skipped.');
    return;
  }

  const topLevelKeys = Object.keys(msg.message);
  logger.debug(
    { id: msg.key?.id, fromMe: msg.key?.fromMe, remoteJid: msg.key?.remoteJid, topLevelKeys },
    'viewOnceHandler: inspecting message.'
  );

  const inner = extractViewOnceContent(msg.message);
  if (!inner) {
    logger.debug({ id: msg.key?.id, topLevelKeys }, 'viewOnceHandler: not a View Once message, skipped.');
    return;
  }

  const media = describeMedia(inner);
  if (!media) {
    logger.debug(
      { id: msg.key?.id, innerKeys: Object.keys(inner) },
      'viewOnceHandler: View Once wrapper found but no recognized media type inside it.'
    );
    return;
  }

  // Always stash it, even when auto-capture is off: the emoji trigger in
  // viewOnceTriggerHandler.js has no other source for the media, since a
  // reaction carries only the target's key and no content at all.
  rememberViewOnce({ key: msg.key, inner, media });

  if (!config.antiViewOnce) {
    logger.debug(
      { id: msg.key?.id },
      'viewOnceHandler: cached the media but auto-capture is off — waiting for a manual trigger.'
    );
    return;
  }

  logger.info({ id: msg.key?.id, kind: media.kind }, 'viewOnceHandler: View Once media detected, attempting capture.');

  const maxBytes = config.maxDownloadMB * 1024 * 1024;
  const reportedSize = Number(inner[media.key]?.fileLength || 0);
  if (reportedSize && reportedSize > maxBytes) {
    logger.warn(
      { reportedSize, maxBytes },
      'Skipped a View Once capture — media exceeds the configured size limit.'
    );
    return;
  }

  // downloadMediaMessage looks for known media keys under msg.message, so
  // we hand it a reconstructed message with the wrapper stripped off.
  const downloadable = { key: msg.key, message: inner };
  const buffer = await downloadMediaMessage(
    downloadable,
    'buffer',
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );
  logger.info({ id: msg.key?.id, bytes: buffer?.length }, 'viewOnceHandler: media downloaded successfully.');

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const caption =
    `👁️ *View Once ${media.kind}* captured\n` +
    `From: ${senderJid}\n` +
    `Chat: ${msg.key.remoteJid}`;

  const payload =
    media.kind === 'image'
      ? { image: buffer, caption }
      : media.kind === 'video'
        ? { video: buffer, caption }
        : {
            audio: buffer,
            mimetype: inner.audioMessage?.mimetype || 'audio/ogg; codecs=opus',
            ptt: true,
          };

  for (const ownerNumber of config.ownerNumbers) {
    const ownerJid = `${ownerNumber}@s.whatsapp.net`;
    try {
      await sock.sendMessage(ownerJid, payload);
      logger.info({ ownerJid }, 'viewOnceHandler: forwarded captured media to owner.');
      if (media.kind === 'audio') {
        await sock.sendMessage(ownerJid, { text: caption });
      }
    } catch (err) {
      logger.error({ err, ownerJid }, 'Failed to forward captured View Once media to owner.');
    }
  }
}

module.exports = { registerViewOnceHandler };
