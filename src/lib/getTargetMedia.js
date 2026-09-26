'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const logger = require('../utils/logger');
const { unwrapMessage } = require('../utils/messageContent');

const MEDIA_KEYS = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];

function findMediaKey(message) {
  if (!message) return null;
  const unwrapped = unwrapMessage(message) || message;
  for (const key of MEDIA_KEYS) {
    if (unwrapped[key]) return { key, content: unwrapped[key] };
  }
  return null;
}

/**
 * Resolves the media a command should act on:
 * 1. Media attached directly to this message (e.g. sending an image with
 *    ".sticker" as the caption)
 * 2. Media in a message this one is replying to (the far more common case
 *    — "reply to an image with .sticker")
 *
 * Returns null if neither is present, so callers can show a clear
 * "reply to an image/video with this command" message instead of a crash.
 */
async function getTargetMedia(sock, msg) {
  const direct = findMediaKey(msg.message);
  if (direct) {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    return { buffer, type: direct.key, mimetype: direct.content.mimetype };
  }

  const contextInfo =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.conversation?.contextInfo;

  const quoted = contextInfo?.quotedMessage;
  if (!quoted) return null;

  const found = findMediaKey(quoted);
  if (!found) return null;

  const fakeMsg = {
    key: {
      remoteJid: msg.key.remoteJid,
      id: contextInfo.stanzaId,
      participant: contextInfo.participant,
      fromMe: false,
    },
    message: quoted,
  };

  const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
  return { buffer, type: found.key, mimetype: found.content.mimetype };
}

module.exports = { getTargetMedia };
