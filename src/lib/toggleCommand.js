'use strict';

const { config } = require('../config');
const { updateSetting } = require('../database/settingsStore');

/**
 * Builds a standard owner-only ".<name> on|off" command backed by a single
 * boolean setting in settingsStore. Used by antiviewonce, antidelete,
 * statusview, and statussave so the on/off parsing logic lives in one place.
 */
function buildToggleCommand({ name, aliases = [], description, settingKey, category = 'privacy' }) {
  return {
    name,
    aliases,
    description,
    category,
    usage: `${name} <on|off>`,
    ownerOnly: true,
    groupOnly: false,
    cooldown: 2,
    async handler({ args, reply }) {
      const arg = (args[0] || '').toLowerCase();

      if (!arg) {
        await reply(`*${name}* is currently: ${config[settingKey] ? 'ON ✅' : 'OFF ⛔'}\nUsage: ${config.prefix}${name} on|off`);
        return;
      }

      if (!['on', 'off'].includes(arg)) {
        await reply(`⚠️ Usage: ${config.prefix}${name} on|off`);
        return;
      }

      try {
        const applied = updateSetting(config, settingKey, arg === 'on');
        await reply(`✅ *${name}* is now ${applied ? 'ON' : 'OFF'}.`);
      } catch (err) {
        await reply(`⚠️ ${err.message}`);
      }
    },
  };
}

module.exports = { buildToggleCommand };
