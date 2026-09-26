'use strict';

const { getTargetParticipant } = require('../../lib/getTargetParticipant');
const { getWarnings, clearWarnings } = require('../../database/warningsStore');

module.exports = {
  name: 'warnings',
  aliases: [],
  description: "Shows a mentioned or replied-to member's warning history. Add 'clear' to reset it.",
  category: 'group',
  usage: 'warnings (mention or reply) [clear]',
  groupOnly: true,
  adminOnly: true,
  cooldown: 3,
  async handler({ args, msg, from, sock, reply }) {
    const target = getTargetParticipant(msg);
    if (!target) {
      await reply('Mention or reply to the member whose warnings you want to see.');
      return;
    }

    if (args.includes('clear')) {
      clearWarnings(from, target);
      await sock.sendMessage(from, { text: `✅ Cleared warnings for @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
      return;
    }

    const list = getWarnings(from, target);
    if (list.length === 0) {
      await sock.sendMessage(from, { text: `@${target.split('@')[0]} has no warnings on record.`, mentions: [target] }, { quoted: msg });
      return;
    }

    const lines = list.map((w, i) => `${i + 1}. ${w.reason} — ${new Date(w.at).toLocaleDateString()}`);
    await sock.sendMessage(
      from,
      { text: `⚠️ Warnings for @${target.split('@')[0]}:\n\n${lines.join('\n')}`, mentions: [target] },
      { quoted: msg }
    );
  },
};
