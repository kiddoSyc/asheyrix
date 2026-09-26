'use strict';

const musicStore = require('../../database/musicStore');
const { QUALITY_PRESETS } = require('../../services/music/settings');
const { musicSetting } = require('../../services/music/settings');
const { cancelForUser, pendingForUser, queueStatus } = require('../../services/music/queue');

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

module.exports = [
  {
    name: 'quality',
    description: 'Sets your audio quality for .play (low, medium, high).',
    category: 'music',
    usage: 'quality <low|medium|high>',
    cooldown: 3,
    async handler({ args, sender, reply, config }) {
      const choice = (args[0] || '').toLowerCase();
      const current = musicStore.getQuality(sender) || musicSetting('defaultQuality');

      if (!choice) {
        await reply(
          `🎚️ Your quality: *${current}*\n` +
            `Options: ${Object.keys(QUALITY_PRESETS).join(', ')}\n` +
            `Change it with ${config.prefix}quality high`
        );
        return;
      }

      if (!QUALITY_PRESETS[choice]) {
        await reply(`⚠️ Pick one of: ${Object.keys(QUALITY_PRESETS).join(', ')}`);
        return;
      }

      musicStore.setQuality(sender, choice);
      await reply(`✅ Quality set to *${choice}* (${QUALITY_PRESETS[choice].bitrate}).`);
    },
  },

  {
    name: 'history',
    aliases: ['recent'],
    description: 'Shows the last songs you played. Use "clear" to wipe it.',
    category: 'music',
    usage: 'history [clear]',
    cooldown: 3,
    async handler({ args, sender, reply, config }) {
      if ((args[0] || '').toLowerCase() === 'clear') {
        musicStore.clearHistory(sender);
        await reply('🧹 History cleared.');
        return;
      }

      const list = musicStore.getHistory(sender);
      if (list.length === 0) {
        await reply(`📭 Nothing yet. Play something with ${config.prefix}play <song>`);
        return;
      }

      const lines = list.map((h, i) => `*${i + 1}.* ${h.title}\n   _${timeAgo(h.at)}_`);
      await reply(`🕘 *Your recent plays*\n\n${lines.join('\n')}`);
    },
  },

  {
    name: 'favorites',
    aliases: ['fav', 'favourites'],
    description: 'Lists, adds or removes saved songs.',
    category: 'music',
    usage: 'favorites [add <n> | del <n>]',
    cooldown: 3,
    async handler({ args, sender, reply, config }) {
      const action = (args[0] || '').toLowerCase();

      if (action === 'add') {
        // Saves by position in your history — no need to retype a title.
        const index = Number(args[1]) - 1;
        const history = musicStore.getHistory(sender);
        const entry = history[index];

        if (!entry) {
          await reply(`⚠️ Use ${config.prefix}favorites add <number from ${config.prefix}history>`);
          return;
        }

        const result = musicStore.addFavorite(sender, entry);
        await reply(result.added ? `⭐ Saved *${entry.title}*.` : `⚠️ Not saved — ${result.reason}.`);
        return;
      }

      if (action === 'del' || action === 'remove') {
        const removed = musicStore.removeFavorite(sender, Number(args[1]) - 1);
        await reply(removed ? `🗑️ Removed *${removed.title}*.` : '⚠️ No favourite with that number.');
        return;
      }

      const list = musicStore.getFavorites(sender);
      if (list.length === 0) {
        await reply(
          `⭐ No favourites yet.\nPlay something, then ${config.prefix}favorites add 1 to save it from your history.`
        );
        return;
      }

      const lines = list.map((f, i) => `*${i + 1}.* ${f.title}\n   ${f.url}`);
      await reply(`⭐ *Your favourites*\n\n${lines.join('\n\n')}`);
    },
  },

  {
    name: 'cancel',
    description: 'Cancels your queued downloads.',
    category: 'music',
    usage: 'cancel',
    cooldown: 3,
    async handler({ sender, reply }) {
      const pending = pendingForUser(sender);
      const cancelled = cancelForUser(sender);
      const status = queueStatus();

      if (cancelled === 0) {
        await reply(
          `🤷 Nothing of yours is waiting.\n_Queue: ${status.active} running, ${status.waiting} waiting._\n` +
            `_A download already in progress can't be stopped._`
        );
        return;
      }

      await reply(`🛑 Cancelled ${cancelled} of your ${pending} queued download(s).`);
    },
  },
];
