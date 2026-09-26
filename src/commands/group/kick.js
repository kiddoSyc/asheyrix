'use strict';

const { getTargetParticipant } = require('../../lib/getTargetParticipant');
const logger = require('../../utils/logger');

module.exports = {
  name: 'kick',
  aliases: ['remove'],
  description: 'Removes a mentioned or replied-to member from the group.',
  category: 'group',
  usage: 'kick (mention or reply to a member)',
  groupOnly: true,
  adminOnly: true,
  cooldown: 3,
  async handler({ sock, from, msg, reply }) {
    const target = getTargetParticipant(msg);
    if (!target) {
      await reply('Mention or reply to the member you want to kick.');
      return;
    }
    try {
      await sock.groupParticipantsUpdate(from, [target], 'remove');
      await reply(`✅ Removed @${target.split('@')[0]}`);
    } catch (err) {
      logger.error({ err }, 'Failed to kick a group member.');
      await reply('❌ Could not remove that member — the bot may not be an admin here.');
    }
  },
};
