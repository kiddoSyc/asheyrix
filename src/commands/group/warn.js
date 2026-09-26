'use strict';

const { getTargetParticipant } = require('../../lib/getTargetParticipant');
const { addWarning, MAX_WARNINGS_BEFORE_KICK } = require('../../database/warningsStore');
const logger = require('../../utils/logger');

module.exports = {
  name: 'warn',
  aliases: [],
  description: 'Warns a mentioned or replied-to member (with an optional reason).',
  category: 'group',
  usage: 'warn (mention or reply) [reason]',
  groupOnly: true,
  adminOnly: true,
  cooldown: 3,
  async handler({ args, msg, from, sock, reply }) {
    const target = getTargetParticipant(msg);
    if (!target) {
      await reply('Mention or reply to the member you want to warn.');
      return;
    }

    const reasonText = args.filter((a) => !a.startsWith('@')).join(' ');

    try {
      const count = addWarning(from, target, reasonText);
      const text =
        `⚠️ Warned @${target.split('@')[0]} (${count}/${MAX_WARNINGS_BEFORE_KICK})` +
        (reasonText ? `\nReason: ${reasonText}` : '');
      await sock.sendMessage(from, { text, mentions: [target] }, { quoted: msg });
    } catch (err) {
      logger.error({ err }, 'Failed to record a warning.');
      await reply('❌ Could not record that warning.');
    }
  },
};
