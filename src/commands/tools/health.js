'use strict';

const os = require('os');
const { config } = require('../../config');
const { runAiPrompt } = require('../../lib/aiCommandHelper');
const { aiStatus } = require('../../services/ai');
const { queueStatus } = require('../../services/music/queue');
const { runStartupDiagnostics } = require('../../lib/diagnostics');
const { musicSetting } = require('../../services/music/settings');

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

module.exports = [
  {
    name: 'health',
    aliases: ['status', 'diag'],
    description: 'Shows bot health: uptime, memory, external tools and the download queue.',
    category: 'tools',
    usage: 'health',
    cooldown: 5,
    async handler({ reply, commands }) {
      // Re-runs the same checks the bot does at startup, so this reflects
      // the machine now rather than whatever was true at boot.
      const tools = await runStartupDiagnostics();
      const memory = process.memoryUsage();
      const queue = queueStatus();
      const ai = aiStatus();

      const tick = (ok) => (ok ? '✅' : '❌');

      await reply(
        `🩺 *${config.botName} health*\n\n` +
          `• Uptime: ${formatUptime(process.uptime())}\n` +
          `• Memory: ${(memory.rss / 1024 / 1024).toFixed(0)}MB RSS\n` +
          `• Load: ${os.loadavg().map((n) => n.toFixed(2)).join(', ')}\n` +
          `• Node: ${process.version}\n` +
          `• Commands: ${commands?.all?.length ?? '?'}\n\n` +
          `*Tools*\n` +
          `${tick(tools.ffmpeg.found)} ffmpeg\n` +
          `${tick(tools.ytDlp.found)} yt-dlp\n` +
          `${tick(tools.tesseract.found)} tesseract\n\n` +
          `*Music*\n` +
          `• Enabled: ${musicSetting('enabled') ? 'yes' : 'no'}\n` +
          `• Queue: ${queue.active} running / ${queue.waiting} waiting (limit ${queue.limit})\n` +
          `• Default quality: ${musicSetting('defaultQuality')}\n\n` +
          `*AI*: ${ai.ready ? `ready (${config.aiProvider})` : 'off'}`
      );
    },
  },

  {
    name: 'define',
    aliases: ['dict', 'meaning'],
    description: 'Defines a word.',
    category: 'tools',
    usage: 'define <word>',
    cooldown: 5,
    async handler(ctx) {
      const word = (ctx.text || '').trim();
      if (!word) {
        await ctx.reply(`Usage: ${config.prefix}define <word>`);
        return;
      }
      if (word.length > 60) {
        await ctx.reply('⚠️ That\'s a bit long for a dictionary lookup.');
        return;
      }

      // No dictionary API key to manage: this leans on whatever AI provider
      // is already configured, and says so plainly when there isn't one.
      if (!aiStatus().ready) {
        await ctx.reply(
          `📖 Definitions need an AI provider configured (see AI_API_KEY in .env).\n` +
            `Meanwhile: https://www.merriam-webster.com/dictionary/${encodeURIComponent(word)}`
        );
        return;
      }

      await runAiPrompt(ctx, {
        argText: word,
        instruction:
          'Define this word concisely for a chat message: part of speech, a one-line meaning, ' +
          'and one short example sentence. No preamble.',
        useHistory: false,
      });
    },
  },
];
