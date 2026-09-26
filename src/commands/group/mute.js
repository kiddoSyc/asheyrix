'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'mute',
  aliases: [],
  description: 'Restricts the group so only admins can send messages (WhatsApp\'s native "announcement" mode).',
  category: 'group',
  usage: 'mute',
  groupOnly: true,
  adminOnly: true,
  cooldown: 5,
  async handler({ sock, from, reply }) {
    try {
      await sock.groupSettingUpdate(from, 'announcement');
      await reply('🔇 Group muted — only admins can send messages now.');
    } catch (err) {
      logger.error({ err }, 'Failed to mute group.');
      await reply('❌ Could not mute the group — the bot may not be an admin here.');
    }
  },
};
