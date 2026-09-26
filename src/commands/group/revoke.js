'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'revoke',
  aliases: [],
  description: "Revokes the group's current invite link and generates a new one.",
  category: 'group',
  usage: 'revoke',
  groupOnly: true,
  adminOnly: true,
  cooldown: 5,
  async handler({ sock, from, reply }) {
    try {
      await sock.groupRevokeInvite(from);
      await reply('✅ Invite link revoked. Use *.link* to get the new one.');
    } catch (err) {
      logger.error({ err }, 'Failed to revoke group invite link.');
      await reply('❌ Could not revoke the invite link — the bot may not be an admin here.');
    }
  },
};
