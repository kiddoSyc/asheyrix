'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { config } = require('../config');
const logger = require('../utils/logger');
const { subscribeToMessages } = require('./messageBus');

function describeMedia(message) {
  if (!message) return null;
  if (message.imageMessage) return { key: 'imageMessage', kind: 'image' };
  if (message.videoMessage) return { key: 'videoMessage', kind: 'video' };
  return null;
}

function registerStatusHandler(sock) {
  subscribeToMessages(({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.remoteJid !== 'status@broadcast') continue;
      if (msg.key.fromMe) continue; // don't react to / save our own statuses

      handleOne(sock, msg).catch((err) => {
        logger.error({ err }, 'Status handler failed on a status update (skipped, bot kept running).');
      });
    }
  }, { name: 'status' });
}

async function handleOne(sock, msg) {
  const posterJid = msg.key.participant;
  if (!posterJid) return;

  if (config.statusView) {
    try {
      await sock.readMessages([msg.key]);
    } catch (err) {
      logger.warn({ err }, 'Failed to mark a status as viewed.');
    }
  }

  if (config.statusReact) {
    try {
      await sock.sendMessage(
        'status@broadcast',
        { react: { text: config.statusReactEmoji, key: msg.key } },
        { statusJidList: [posterJid] }
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to react to a status.');
    }
  }

  if (config.statusAutoSave) {
    await saveStatus(sock, msg, posterJid);
  }
}

async function saveStatus(sock, msg, posterJid) {
  if (config.ownerNumbers.length === 0) return;

  const media = describeMedia(msg.message);
  const caption = `📥 *Status saved*\nFrom: ${posterJid}`;

  try {
    if (media) {
      const maxBytes = config.maxDownloadMB * 1024 * 1024;
      const reportedSize = Number(msg.message[media.key]?.fileLength || 0);
      if (reportedSize && reportedSize > maxBytes) {
        logger.warn({ reportedSize, maxBytes }, 'Skipped saving a status — media exceeds the size limit.');
        return;
      }

      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger, reuploadRequest: sock.updateMediaMessage }
      );
      const payload =
        media.kind === 'image' ? { image: buffer, caption } : { video: buffer, caption };

      for (const ownerNumber of config.ownerNumbers) {
        await sock.sendMessage(`${ownerNumber}@s.whatsapp.net`, payload);
      }
      return;
    }

    const text = msg.message?.extendedTextMessage?.text || msg.message?.conversation;
    if (!text) return; // nothing we know how to save (e.g. an unsupported status type)

    for (const ownerNumber of config.ownerNumbers) {
      await sock.sendMessage(`${ownerNumber}@s.whatsapp.net`, { text: `${caption}\n\n"${text}"` });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to save/forward a status.');
  }
}

module.exports = { registerStatusHandler };
