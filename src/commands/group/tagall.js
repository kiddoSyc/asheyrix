'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'tagall',
  aliases: ['ta2'],
  description: 'Mentions every member of the group.',
  category: 'group',
  usage: 'tagall [message]',
  groupOnly: true,
  adminOnly: true,
  cooldown: 10,
  async handler({ args, sock, from, msg, reply }) {
    try {
      const metadata = await sock.groupMetadata(from);
      const mentions = metadata.participants.map((p) => p.id);
      const header = args.length ? `${args.join(' ')}\n\n` : '';
      const body = mentions.map((jid) => `@${jid.split('@')[0]}`).join(' ');
      await sock.sendMessage(from, { text: `${header}${body}`, mentions }, { quoted: msg });
    } catch (err) {
      logger.error({ err }, 'Failed to tag all members.');
      await reply('❌ Could not fetch group members.');
    }
  },
};
