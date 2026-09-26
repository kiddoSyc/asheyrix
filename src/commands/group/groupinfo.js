'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'groupinfo',
  aliases: ['gi'],
  description: 'Shows information about the current group.',
  category: 'group',
  usage: 'groupinfo',
  groupOnly: true,
  cooldown: 5,
  async handler({ sock, from, reply }) {
    try {
      const metadata = await sock.groupMetadata(from);
      const adminCount = metadata.participants.filter((p) => p.admin).length;
      const created = metadata.creation ? new Date(metadata.creation * 1000).toLocaleDateString() : 'unknown';
      await reply(
        `*${metadata.subject}*\n` +
          `${metadata.desc ? `${metadata.desc}\n\n` : '\n'}` +
          `👥 Members: ${metadata.participants.length}\n` +
          `👑 Admins: ${adminCount}\n` +
          `📅 Created: ${created}`
      );
    } catch (err) {
      logger.error({ err }, 'Failed to fetch group info.');
      await reply('❌ Could not fetch group info.');
    }
  },
};
