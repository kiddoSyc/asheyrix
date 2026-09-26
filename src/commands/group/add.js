'use strict';

const logger = require('../../utils/logger');

module.exports = {
  name: 'add',
  aliases: [],
  description: 'Adds a phone number to the group.',
  category: 'group',
  usage: 'add <number>',
  groupOnly: true,
  adminOnly: true,
  cooldown: 5,
  async handler({ args, sock, from, reply }) {
    const number = (args[0] || '').replace(/\D/g, '');
    if (!number) {
      await reply('Usage: .add <number, digits only, international format>');
      return;
    }
    const jid = `${number}@s.whatsapp.net`;
    try {
      const result = await sock.groupParticipantsUpdate(from, [jid], 'add');
      const status = String(result?.[0]?.status || '');
      if (status === '200') {
        await reply(`✅ Added ${number}`);
      } else {
        await reply(
          `⚠️ Could not add ${number} (status ${status || 'unknown'}) — their privacy settings may require them to join via invite link instead.`
        );
      }
    } catch (err) {
      logger.error({ err }, 'Failed to add a group member.');
      await reply('❌ Could not add that number — the bot may not be an admin here.');
    }
  },
};
