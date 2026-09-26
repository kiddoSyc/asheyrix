'use strict';

const { getTargetParticipant } = require('../../lib/getTargetParticipant');
const logger = require('../../utils/logger');

module.exports = {
  name: 'promote',
  aliases: [],
  description: 'Promotes a mentioned or replied-to member to admin.',
  category: 'group',
  usage: 'promote (mention or reply to a member)',
  groupOnly: true,
  adminOnly: true,
  cooldown: 3,
  async handler({ sock, from, msg, reply }) {
    const target = getTargetParticipant(msg);
    if (!target) {
      await reply('Mention or reply to the member you want to promote.');
      return;
    }
    try {
      await sock.groupParticipantsUpdate(from, [target], 'promote');
      await reply(`✅ Promoted @${target.split('@')[0]} to admin.`);
    } catch (err) {
      logger.error({ err }, 'Failed to promote a group member.');
      await reply('❌ Could not promote that member — the bot may not be an admin here.');
    }
  },
};
