'use strict';

const { config } = require('../../config');
const { updateSetting, listSettableKeys } = require('../../database/settingsStore');

module.exports = {
  name: 'config',
  aliases: ['settings', 'cfg'],
  description: 'View or change bot settings at runtime, without editing .env (owner only).',
  category: 'owner',
  usage: 'config [key] [value]',
  ownerOnly: true,
  groupOnly: false,
  cooldown: 2,
  async handler({ args, reply }) {
    const settableKeys = listSettableKeys();

    // .config -> show everything
    if (args.length === 0) {
      const lines = [`*${config.botName} — current settings*`, ''];
      for (const key of settableKeys) {
        lines.push(`• ${key}: ${JSON.stringify(config[key])}`);
      }
      lines.push('');
      lines.push(`Usage: ${config.prefix}config <key> <value>`);
      lines.push(`Example: ${config.prefix}config prefix !`);
      await reply(lines.join('\n'));
      return;
    }

    // .config <key> -> show just that one
    if (args.length === 1) {
      const [key] = args;
      if (!settableKeys.includes(key)) {
        await reply(
          `⚠️ Unknown or protected setting "${key}".\nConfigurable: ${settableKeys.join(', ')}`
        );
        return;
      }
      await reply(`*${key}*: ${JSON.stringify(config[key])}`);
      return;
    }

    // .config <key> <value...> -> set it
    const [key, ...rest] = args;
    const rawValue = rest.join(' ');

    try {
      const applied = updateSetting(config, key, rawValue);
      await reply(`✅ *${key}* updated to: ${JSON.stringify(applied)}\nThis is saved and will persist across restarts.`);
    } catch (err) {
      await reply(`⚠️ ${err.message}`);
    }
  },
};
