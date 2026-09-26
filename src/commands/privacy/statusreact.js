'use strict';

const { config } = require('../../config');
const { updateSetting } = require('../../database/settingsStore');

// A rough emoji sanity check — not perfect, but stops obviously-wrong input
// (plain words, whole sentences) from being saved as a "reaction emoji".
function looksLikeEmoji(str) {
  return /\p{Extended_Pictographic}/u.test(str) && str.length <= 8;
}

module.exports = {
  name: 'statusreact',
  aliases: ['sr'],
  description: 'Controls auto-reacting to contacts\' statuses: on/off, or set the emoji (e.g. .statusreact ❤️).',
  category: 'privacy',
  usage: 'statusreact <on|off|emoji>',
  ownerOnly: true,
  groupOnly: false,
  cooldown: 2,
  async handler({ args, reply }) {
    const arg = (args[0] || '').trim();

    if (!arg) {
      await reply(
        `*statusreact* is currently: ${config.statusReact ? 'ON ✅' : 'OFF ⛔'}\n` +
          `Emoji: ${config.statusReactEmoji}\n` +
          `Usage: ${config.prefix}statusreact on|off|<emoji>`
      );
      return;
    }

    const lower = arg.toLowerCase();

    try {
      if (lower === 'on' || lower === 'off') {
        const applied = updateSetting(config, 'statusReact', lower === 'on');
        await reply(`✅ *statusreact* is now ${applied ? 'ON' : 'OFF'}.`);
        return;
      }

      if (!looksLikeEmoji(arg)) {
        await reply(`⚠️ That doesn't look like an emoji. Usage: ${config.prefix}statusreact on|off|<emoji>`);
        return;
      }

      const appliedEmoji = updateSetting(config, 'statusReactEmoji', arg);
      // Setting an emoji implies the intent to have reactions on.
      updateSetting(config, 'statusReact', true);
      await reply(`✅ Status reactions are ON, using ${appliedEmoji}`);
    } catch (err) {
      await reply(`⚠️ ${err.message}`);
    }
  },
};
