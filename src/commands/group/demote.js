'use strict';

const { getTargetParticipant } = require('../../lib/getTargetParticipant');
const logger = require('../../utils/logger');

module.exports = {
  name: 'demote',
  aliases: [],
  description: 'Demotes a mentioned or replied-to admin back to a regular member.',
  category: 'group',
  usage: 'demote (mention or reply to a member)',
  groupOnly: true,
  adminOnly: true,
  cooldown: 3,
  async handler({ sock, from, msg, reply }) {
    const target = getTargetParticipant(msg);
    if (!target) {
      await reply('Mention or reply to the member you want to demote.');
      return;
    }
    try {
      await sock.groupParticipantsUpdate(from, [target], 'demote');
      await reply(`✅ Demoted @${target.split('@')[0]}.`);
    } catch (err) {
      logger.error({ err }, 'Failed to demote a group member.');
      await reply('❌ Could not demote that member — the bot may not be an admin here.');
    }
  },
};
