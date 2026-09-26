'use strict';

const { renderTextSticker } = require('../../services/media/textSticker');
const { MediaError } = require('../../services/media/errors');
const { getQuotedInfo } = require('../../utils/quoted');
const { extractText } = require('../../utils/messageContent');
const logger = require('../../utils/logger');

module.exports = {
  name: 'make',
  aliases: ['ttp', 'textsticker'],
  description: 'Turns text into a sticker. Works on a replied-to message too.',
  category: 'media',
  usage: 'make <text>',
  cooldown: 8,
  async handler({ text, msg, sock, from, reply, config }) {
    const typed = (text || '').trim();
    const quoted = typed ? null : getQuotedInfo(msg);
    const input = typed || (quoted ? extractText(quoted.message).trim() : '');

    if (!input) {
      await reply(`Usage: ${config.prefix}make <text>\nOr reply to a message with *${config.prefix}make*.`);
      return;
    }

    try {
      const sticker = await renderTextSticker(input);
      await sock.sendMessage(from, { sticker }, { quoted: msg });
    } catch (err) {
      if (err instanceof MediaError) {
        await reply(`⚠️ ${err.message}`);
        return;
      }
      logger.error({ err }, 'Text sticker generation failed.');
      await reply('❌ Could not make that sticker.');
    }
  },
};
