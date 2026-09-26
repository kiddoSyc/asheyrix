'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'unmute',
  aliases: [],
  description: 'Allows all members to send messages again.',
  category: 'group',
  usage: 'unmute',
  groupOnly: true,
  adminOnly: true,
  cooldown: 5,
  async handler({ sock, from, reply }) {
    try {
      await sock.groupSettingUpdate(from, 'not_announcement');
      await reply('🔊 Group unmuted — everyone can send messages again.');
    } catch (err) {
      logger.error({ err }, 'Failed to unmute group.');
      await reply('❌ Could not unmute the group — the bot may not be an admin here.');
    }
  },
};
