'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'admins',
  aliases: [],
  description: 'Lists the current group admins.',
  category: 'group',
  usage: 'admins',
  groupOnly: true,
  cooldown: 5,
  async handler({ sock, from, msg, reply }) {
    try {
      const metadata = await sock.groupMetadata(from);
      const admins = metadata.participants.filter((p) => p.admin);
      if (admins.length === 0) {
        await reply('No admins found (unusual — every group needs at least one).');
        return;
      }
      const mentions = admins.map((a) => a.id);
      const lines = admins.map((a) => `• @${a.id.split('@')[0]}`);
      await sock.sendMessage(from, { text: `*Group admins:*\n\n${lines.join('\n')}`, mentions }, { quoted: msg });
    } catch (err) {
      logger.error({ err }, 'Failed to fetch group admins.');
      await reply('❌ Could not fetch group admins.');
    }
  },
};
