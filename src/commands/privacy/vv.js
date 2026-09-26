'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { config } = require('../../config');
const logger = require('../../utils/logger');
const { extractViewOnceContent, describeViewOnceMedia } = require('../../utils/viewOnce');
const { getQuotedInfo, buildFakeMessage } = require('../../utils/quoted');

/**
 * Manual, reply-targeted View Once unlock.
 *
 * Since the June 2024 WhatsApp protocol change, Baileys frequently isn't
 * handed the decryption key for View Once media in the raw incoming
 * upsert — the automatic background handler (viewOnceHandler.js) can miss
 * it entirely. Replying to the message is what makes WhatsApp resend the
 * full content (including the key) to Baileys as `contextInfo.quotedMessage`,
 * so that's what this command reads from — never the live upsert stream.
 *
 * Usage: reply to a View Once photo/video/voice note with ".vv".
 */
module.exports = {
  name: 'vv',
  aliases: ['viewonce', 'reveal'],
  description: 'Reply to a View Once photo/video/voice note with this to unlock and resend just that one.',
  category: 'privacy',
  usage: 'vv (reply to a View Once message)',
  ownerOnly: true,
  cooldown: 5,
  async handler({ sock, msg, reply }) {
    const quoted = getQuotedInfo(msg);
    if (!quoted) {
      await reply('Reply to a View Once photo, video, or voice note with *.vv*.');
      return;
    }

    const inner = extractViewOnceContent(quoted.message);
    if (!inner) {
      await reply(
        "That replied-to message doesn't look like View Once media — or it already opened/expired before you replied."
      );
      return;
    }

    const media = describeViewOnceMedia(inner);
    if (!media) {
      await reply('Found a View Once wrapper but no recognized media type inside it.');
      return;
    }

    const maxBytes = config.maxDownloadMB * 1024 * 1024;
    const reportedSize = Number(inner[media.key]?.fileLength || 0);
    if (reportedSize && reportedSize > maxBytes) {
      await reply(`⚠️ That media is too large to download (limit is ${config.maxDownloadMB}MB).`);
      return;
    }

    const downloadable = buildFakeMessage({ quoted, remoteJid: msg.key.remoteJid, message: inner });

    let buffer;
    try {
      buffer = await downloadMediaMessage(
        downloadable,
        'buffer',
        {},
        { logger, reuploadRequest: sock.updateMediaMessage }
      );
    } catch (err) {
      logger.error({ err }, 'Failed to download View Once media via .vv.');
      await reply(
        '❌ Failed to download that View Once media. It may have already expired, or Baileys still lacked the key — try replying to it again.'
      );
      return;
    }

    const senderJid = quoted.participant || msg.key.remoteJid;
    const caption = `👁️ *View Once ${media.kind}* unlocked\nFrom: ${senderJid}`;

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

    await sock.sendMessage(msg.key.remoteJid, payload, { quoted: msg });
    if (media.kind === 'audio') {
      await sock.sendMessage(msg.key.remoteJid, { text: caption }, { quoted: msg });
    }
  },
};
