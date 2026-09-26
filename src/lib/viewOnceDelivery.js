'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { config } = require('../config');
const logger = require('../utils/logger');

/**
 * Every path that unlocks View Once media funnels through here, so there is
 * exactly one place that decides where the result goes — the owner's DM,
 * never the chat the media came from. Nothing in this module ever sends to
 * `msg.key.remoteJid`; that's deliberate, not an oversight.
 */

function ownerJids() {
  return config.ownerNumbers.map((n) => `${n}@s.whatsapp.net`);
}

/**
 * Sends a plain text note to the owner(s). Used for failures, so a silent
 * trigger never leaves you wondering whether the bot saw it.
 */
async function notifyOwners(sock, text, { onlyJid } = {}) {
  const targets = onlyJid ? [onlyJid] : ownerJids();
  for (const jid of targets) {
    try {
      await sock.sendMessage(jid, { text });
    } catch (err) {
      logger.error({ err, jid }, 'Failed to send View Once notice to owner.');
    }
  }
}

/**
 * Downloads already-detected View Once content and delivers it to the owner
 * DM. Returns true if at least one owner received it.
 *
 * @param {object} params
 * @param {object} params.sock
 * @param {object} params.downloadable  `{ key, message }` shaped for Baileys
 * @param {object} params.inner         flattened View Once content
 * @param {object} params.media         { key, kind }
 * @param {string} params.senderJid     who originally sent the media
 * @param {string} params.chatJid       where it was sent
 * @param {string} [params.trigger]     how it was unlocked, for the caption
 * @param {string} [params.onlyJid]     deliver to just this owner JID
 */
async function unlockAndSend({
  sock,
  downloadable,
  inner,
  media,
  senderJid,
  chatJid,
  trigger = 'manual',
  onlyJid,
}) {
  const maxBytes = config.maxDownloadMB * 1024 * 1024;
  const reportedSize = Number(inner?.[media.key]?.fileLength || 0);
  if (reportedSize && reportedSize > maxBytes) {
    await notifyOwners(
      sock,
      `⚠️ Skipped a View Once ${media.kind} — it's larger than the ${config.maxDownloadMB}MB limit.`,
      { onlyJid }
    );
    return false;
  }

  let buffer;
  try {
    buffer = await downloadMediaMessage(
      downloadable,
      'buffer',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    );
  } catch (err) {
    logger.error({ err, trigger }, 'Failed to download View Once media.');
    await notifyOwners(
      sock,
      `❌ Couldn't unlock that View Once ${media.kind}.\n` +
        `From: ${senderJid}\n\n` +
        `WhatsApp may not have handed over the decryption key. Reply *${config.viewOnceTriggerWord}* directly to the message — that's the most reliable trigger.`,
      { onlyJid }
    );
    return false;
  }

  const caption =
    `👁️ *View Once ${media.kind}* unlocked\n` +
    `From: ${senderJid}\n` +
    `Chat: ${chatJid}\n` +
    `Via: ${trigger}`;

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

  const targets = onlyJid ? [onlyJid] : ownerJids();
  let anySent = false;

  for (const jid of targets) {
    try {
      await sock.sendMessage(jid, payload);
      // Voice notes can't carry a caption, so the context follows separately.
      if (media.kind === 'audio') {
        await sock.sendMessage(jid, { text: caption });
      }
      anySent = true;
      logger.info({ jid, kind: media.kind, trigger }, 'Delivered View Once media to owner DM.');
    } catch (err) {
      logger.error({ err, jid }, 'Failed to deliver View Once media to owner DM.');
    }
  }

  return anySent;
}

module.exports = { unlockAndSend, notifyOwners, ownerJids };
