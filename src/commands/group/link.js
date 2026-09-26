'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'link',
  aliases: ['invite'],
  description: "Sends the group's invite link.",
  category: 'group',
  usage: 'link',
  groupOnly: true,
  adminOnly: true,
  cooldown: 5,
  async handler({ sock, from, reply }) {
    try {
      const code = await sock.groupInviteCode(from);
      await reply(`🔗 https://chat.whatsapp.com/${code}`);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch group invite link.');
      await reply('❌ Could not fetch the invite link — the bot may not be an admin here.');
    }
  },
};
