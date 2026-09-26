'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { config } = require('../../config');
const logger = require('../../utils/logger');
const { unwrapMessage } = require('../../utils/messageContent');
const { getQuotedInfo, buildFakeMessage } = require('../../utils/quoted');

function describeStatusMedia(message) {
  if (!message) return null;
  if (message.imageMessage) return { key: 'imageMessage', kind: 'image' };
  if (message.videoMessage) return { key: 'videoMessage', kind: 'video' };
  return null;
}

/**
 * Manual, reply-targeted status save.
 *
 * The always-on statusAutoSave setting (see statusHandler.js) saves every
 * status from every contact as it comes in — sometimes that's too broad.
 * This command instead only ever touches the one status you reply to:
 * reply to that specific status update with ".savestatus" and only that
 * one gets downloaded and sent back — nothing else is scanned.
 *
 * Usage: reply to a status update with ".savestatus".
 */
module.exports = {
  name: 'savestatus',
  aliases: ['sstatus'],
  description: 'Reply to one specific status update with this to save just that one.',
  category: 'privacy',
  usage: 'savestatus (reply to a status)',
  ownerOnly: true,
  cooldown: 5,
  async handler({ sock, msg, reply }) {
    const quoted = getQuotedInfo(msg);
    if (!quoted) {
      await reply('Reply to the specific status you want to save with *.savestatus*.');
      return;
    }

    const posterJid = quoted.participant || msg.key.participant || msg.key.remoteJid;
    const content = unwrapMessage(quoted.message) || quoted.message;
    const media = describeStatusMedia(content);

    try {
      if (media) {
        const maxBytes = config.maxDownloadMB * 1024 * 1024;
        const reportedSize = Number(content[media.key]?.fileLength || 0);
        if (reportedSize && reportedSize > maxBytes) {
          await reply(`⚠️ That status is too large to download (limit is ${config.maxDownloadMB}MB).`);
          return;
        }

        const downloadable = buildFakeMessage({ quoted, remoteJid: 'status@broadcast', message: content });

        const buffer = await downloadMediaMessage(
          downloadable,
          'buffer',
          {},
          { logger, reuploadRequest: sock.updateMediaMessage }
        );

        const caption = `📥 *Status saved*\nFrom: ${posterJid}`;
        const payload = media.kind === 'image' ? { image: buffer, caption } : { video: buffer, caption };
        await sock.sendMessage(msg.key.remoteJid, payload, { quoted: msg });
        return;
      }

      const text = content.extendedTextMessage?.text || content.conversation;
      if (!text) {
        await reply("Couldn't find saveable content in that status (unsupported type).");
        return;
      }

      await reply(`📥 *Status saved*\nFrom: ${posterJid}\n\n"${text}"`);
    } catch (err) {
      logger.error({ err }, 'Failed to save the replied-to status via .savestatus.');
      await reply('❌ Failed to save that status. The error has been logged.');
    }
  },
};
