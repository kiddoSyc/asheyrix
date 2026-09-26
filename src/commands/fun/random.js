'use strict';

const crypto = require('crypto');
const { config } = require('../../config');
const { JOKES, FACTS, EIGHT_BALL, TRUTHS, DARES, ROASTS, COMPLIMENTS } = require('../../data/funContent');
const { getTargetParticipant } = require('../../lib/getTargetParticipant');

/**
 * Fun commands.
 *
 * Two small decisions worth knowing about:
 *
 * 1. Randomness uses crypto.randomInt rather than Math.random. Not because
 *    a dice roll needs to be cryptographically sound, but because
 *    randomInt is rejection-sampled and so has no modulo bias — and using
 *    one random helper everywhere means nobody has to remember which
 *    commands are the "serious" ones.
 *
 * 2. Anything that rates or ships a *person* is seeded from their identity,
 *    so the answer is stable. A .ship that gives a different number every
 *    time it's run is just noise; one that always says the same thing about
 *    the same pair is a running joke. It also stops people re-rolling until
 *    they get the number they wanted.
 */

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

/**
 * Deterministic 0-99 derived from a string. Same input, same output,
 * forever — see note 2 above.
 */
function stableScore(seed) {
  const digest = crypto.createHash('sha256').update(seed.toLowerCase()).digest();
  return digest.readUInt16BE(0) % 100;
}

function mentionOf(jid) {
  return `@${jid.split('@')[0]}`;
}

module.exports = [
  {
    name: 'dice',
    aliases: ['roll'],
    description: 'Rolls dice. Supports notation like 2d6.',
    category: 'fun',
    usage: 'dice [NdM]',
    cooldown: 2,
    async handler({ args, reply }) {
      const notation = (args[0] || '1d6').toLowerCase();
      const match = notation.match(/^(\d*)d(\d+)$/);

      if (!match) {
        await reply(`🎲 Try *${config.prefix}dice 2d6* — that's two six-sided dice.`);
        return;
      }

      const count = Math.min(20, Math.max(1, Number(match[1] || 1)));
      const sides = Math.min(1000, Math.max(2, Number(match[2])));

      const rolls = Array.from({ length: count }, () => crypto.randomInt(sides) + 1);
      const total = rolls.reduce((a, b) => a + b, 0);

      const detail = count > 1 ? `\n${rolls.join(' + ')} = *${total}*` : `\n*${total}*`;
      await reply(`🎲 Rolling ${count}d${sides}${detail}`);
    },
  },

  {
    name: 'coinflip',
    aliases: ['flip', 'coin'],
    description: 'Flips a coin.',
    category: 'fun',
    usage: 'coinflip',
    cooldown: 2,
    async handler({ reply }) {
      await reply(crypto.randomInt(2) ? '🪙 *Heads*' : '🪙 *Tails*');
    },
  },

  {
    name: '8ball',
    aliases: ['8b', 'magic8'],
    description: 'Asks the magic 8-ball a yes/no question.',
    category: 'fun',
    usage: '8ball <question>',
    cooldown: 3,
    async handler({ text, reply }) {
      if (!text.trim()) {
        await reply(`🎱 Ask me something: *${config.prefix}8ball will it rain today*`);
        return;
      }
      await reply(`🎱 _${text.trim()}_\n\n*${pick(EIGHT_BALL)}*`);
    },
  },

  {
    name: 'choose',
    aliases: ['pick', 'decide'],
    description: 'Picks one of several options for you. Separate them with commas or "or".',
    category: 'fun',
    usage: 'choose <a>, <b>, <c>',
    cooldown: 2,
    async handler({ text, reply }) {
      const options = text
        .split(/,| or /i)
        .map((o) => o.trim())
        .filter(Boolean);

      if (options.length < 2) {
        await reply(`🤔 Give me at least two options: *${config.prefix}choose rice, pasta, jollof*`);
        return;
      }

      await reply(`🤔 I'd go with *${pick(options)}*.`);
    },
  },

  {
    name: 'rate',
    description: 'Rates someone or something out of 100. Always gives the same answer for the same thing.',
    category: 'fun',
    usage: 'rate <thing>  •  reply to someone with .rate',
    cooldown: 3,
    async handler(ctx) {
      const { text, reply } = ctx;
      let subject = text.trim();
      let display = subject;

      if (!subject) {
        const target = getTargetParticipant(ctx.msg);
        if (!target) {
          await reply(`Give me something to rate, or reply to someone with *${config.prefix}rate*.`);
          return;
        }
        subject = target;
        display = mentionOf(target);
      }

      const score = stableScore(subject);
      const bar = '█'.repeat(Math.round(score / 10)).padEnd(10, '░');

      await ctx.sock.sendMessage(
        ctx.from,
        {
          text: `📊 ${display}\n\n${bar} *${score}/100*`,
          mentions: display.startsWith('@') ? [subject] : [],
        },
        { quoted: ctx.msg }
      );
    },
  },

  {
    name: 'ship',
    description: 'Calculates compatibility between two names.',
    category: 'fun',
    usage: 'ship <name> and <name>',
    cooldown: 3,
    async handler({ text, reply }) {
      const parts = text.split(/ and | & |,/i).map((p) => p.trim()).filter(Boolean);

      if (parts.length < 2) {
        await reply(`💘 Give me two: *${config.prefix}ship jollof and rice*`);
        return;
      }

      // Sort so "A and B" and "B and A" give the same result — otherwise
      // people just swap the order until they like the number.
      const [a, b] = parts;
      const score = stableScore([a, b].map((s) => s.toLowerCase()).sort().join('+'));

      const verdict =
        score > 85 ? 'soulmates' :
        score > 65 ? 'genuinely promising' :
        score > 45 ? 'could work with effort' :
        score > 25 ? 'better as friends' :
        'absolutely not';

      const hearts = '❤️'.repeat(Math.max(1, Math.round(score / 20)));

      await reply(`💘 *${a}* + *${b}*\n\n${hearts}\n*${score}%* — ${verdict}`);
    },
  },

  {
    name: 'joke',
    description: 'Tells a joke.',
    category: 'fun',
    usage: 'joke',
    cooldown: 3,
    async handler({ reply }) {
      await reply(`😄 ${pick(JOKES)}`);
    },
  },

  {
    name: 'fact',
    aliases: ['funfact'],
    description: 'Shares a random fact.',
    category: 'fun',
    usage: 'fact',
    cooldown: 3,
    async handler({ reply }) {
      await reply(`💡 ${pick(FACTS)}`);
    },
  },

  {
    name: 'truth',
    description: 'Gives a truth question for truth-or-dare.',
    category: 'fun',
    usage: 'truth',
    cooldown: 3,
    async handler({ reply }) {
      await reply(`🙊 *Truth*\n\n${pick(TRUTHS)}`);
    },
  },

  {
    name: 'dare',
    description: 'Gives a dare for truth-or-dare.',
    category: 'fun',
    usage: 'dare',
    cooldown: 3,
    async handler({ reply }) {
      await reply(`😈 *Dare*\n\n${pick(DARES)}`);
    },
  },

  {
    name: 'roast',
    description: 'Roasts someone (comedy-roast style, not actually mean). Reply to them, name them, or roast yourself.',
    category: 'fun',
    usage: 'roast [name]  •  reply to someone with .roast',
    cooldown: 3,
    async handler(ctx) {
      const { text, reply } = ctx;
      const typed = text.trim();

      // A name typed as text ("roast John") wins over a reply target,
      // since typing a name is the more deliberate choice.
      if (typed) {
        await reply(`🔥 ${pick(ROASTS).replace('{name}', typed)}`);
        return;
      }

      const target = getTargetParticipant(ctx.msg) || ctx.sender;
      const display = mentionOf(target);

      await ctx.sock.sendMessage(
        ctx.from,
        { text: `🔥 ${pick(ROASTS).replace('{name}', display)}`, mentions: [target] },
        { quoted: ctx.msg }
      );
    },
  },

  {
    name: 'compliment',
    aliases: ['nice'],
    description: 'Says something nice about someone.',
    category: 'fun',
    usage: 'compliment  •  reply to someone with .compliment',
    cooldown: 3,
    async handler(ctx) {
      const target = getTargetParticipant(ctx.msg);

      if (!target) {
        await ctx.reply(`🌟 Hey — ${pick(COMPLIMENTS)}.`);
        return;
      }

      await ctx.sock.sendMessage(
        ctx.from,
        { text: `🌟 ${mentionOf(target)} — ${pick(COMPLIMENTS)}.`, mentions: [target] },
        { quoted: ctx.msg }
      );
    },
  },
];
