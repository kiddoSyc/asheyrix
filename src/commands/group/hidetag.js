'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'hidetag',
  aliases: ['ht'],
  description: 'Sends a message that notifies every member without visibly listing them.',
  category: 'group',
  usage: 'hidetag <message>',
  groupOnly: true,
  adminOnly: true,
  cooldown: 10,
  async handler({ text, sock, from, msg, reply }) {
    if (!text) {
      await reply('Usage: .hidetag <message>');
      return;
    }
    try {
      const metadata = await sock.groupMetadata(from);
      const mentions = metadata.participants.map((p) => p.id);
      await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    } catch (err) {
      logger.error({ err }, 'Failed to send hidetag message.');
      await reply('❌ Could not fetch group members.');
    }
  },
};
