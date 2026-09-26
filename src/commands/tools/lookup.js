'use strict';

const { config } = require('../../config');
const logger = require('../../utils/logger');
const { getTargetParticipant } = require('../../lib/getTargetParticipant');
const { isGroupJid } = require('../../utils/jid');

/**
 * Lookups that read from WhatsApp itself rather than transforming text.
 *
 * Both fail softly: WhatsApp returns a 404-ish error for "no profile
 * picture" and for "this person has hidden their picture from you", and
 * those are indistinguishable from the outside. Guessing which one it was
 * would be inventing information, so the message says the honest thing.
 */

function resolveTarget(ctx) {
  const mentioned = getTargetParticipant(ctx.msg);
  if (mentioned) return mentioned;

  // A bare number as an argument, e.g. ".pp 2348012345678"
  const typed = (ctx.text || '').replace(/\D/g, '');
  if (typed.length >= 7) return `${typed}@s.whatsapp.net`;

  // In a DM, default to the other person; in a group, to the sender.
  return ctx.isGroup ? ctx.sender : ctx.from;
}

module.exports = [
  {
    name: 'pp',
    aliases: ['profilepic'],
    description: "Fetches someone's profile picture in full resolution.",
    category: 'tools',
    usage: 'pp  •  reply/mention someone  •  pp <number>',
    cooldown: 5,
    async handler(ctx) {
      const { sock, from, msg, reply } = ctx;
      const target = resolveTarget(ctx);

      try {
        const url = await sock.profilePictureUrl(target, 'image');
        if (!url) throw new Error('no url');

        await sock.sendMessage(
          from,
          { image: { url }, caption: `🖼️ @${target.split('@')[0]}`, mentions: [target] },
          { quoted: msg }
        );
      } catch (err) {
        logger.debug({ err, target }, 'Could not fetch a profile picture.');
        await reply(
          "🖼️ No picture available — they either don't have one, or their privacy settings hide it from this account."
        );
      }
    },
  },

  {
    name: 'whois',
    aliases: ['jid', 'id'],
    description: 'Shows the WhatsApp ID of a chat or person — useful when setting OWNER_NUMBERS.',
    category: 'tools',
    usage: 'whois  •  reply/mention someone with .whois',
    cooldown: 3,
    async handler(ctx) {
      const { from, sender, isGroup, reply } = ctx;
      const target = getTargetParticipant(ctx.msg);

      const lines = ['🪪 *IDs*', ''];
      lines.push(`• This chat: \`${from}\``);
      lines.push(`• Chat type: ${isGroup ? 'group' : 'direct message'}`);
      lines.push(`• You: \`${sender}\``);

      if (target) lines.push(`• Them: \`${target}\``);

      lines.push('');
      lines.push(
        `_The digits before the @ are what OWNER_NUMBERS expects — no plus sign, no spaces._`
      );

      await reply(lines.join('\n'));
    },
  },

  {
    name: 'stats',
    aliases: ['botstats'],
    description: 'Shows what the bot is currently running: commands, memory, uptime.',
    category: 'tools',
    usage: 'stats',
    cooldown: 5,
    async handler({ commands, reply }) {
      const mem = process.memoryUsage();
      const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);

      const categories = [...commands.byCategory.entries()]
        .map(([name, list]) => `  ${name}: ${list.length}`)
        .sort()
        .join('\n');

      await reply(
        [
          `📊 *${config.botName}*`,
          '',
          `• Uptime: ${hours}h ${minutes}m`,
          `• Commands: ${commands.all.length}`,
          categories,
          '',
          `• Heap used: ${mb(mem.heapUsed)} / ${mb(mem.heapTotal)}`,
          `• RSS: ${mb(mem.rss)}`,
          `• Node: ${process.version}`,
          `• Mode: ${config.botMode}`,
        ].join('\n')
      );
    },
  },
];
