'use strict';

const crypto = require('crypto');
const { config } = require('../../config');
const { getQuotedInfo } = require('../../utils/quoted');
const { extractText } = require('../../utils/messageContent');
const { toAsciiArt } = require('../../lib/asciiFont');
const { convert, listUnits, ConversionError } = require('../../lib/unitConverter');

/**
 * The second batch of small text/utility commands. Same shape as
 * textTools.js — typed argument first, replied-to message as a fallback —
 * so the two files behave identically from the user's side.
 */

const MAX_INPUT = 4000;

function targetText(ctx) {
  const typed = (ctx.text || '').trim();
  if (typed) return typed;
  const quoted = getQuotedInfo(ctx.msg);
  return quoted ? extractText(quoted.message).trim() : '';
}

function buildTextCommand({ name, aliases = [], description, usage, transform, cooldown = 2 }) {
  const shownUsage = usage || `${name} <text>`;
  return {
    name,
    aliases,
    description,
    category: 'tools',
    usage: shownUsage,
    cooldown,
    async handler(ctx) {
      const input = targetText(ctx);
      if (!input) {
        await ctx.reply(`Give me some text: *${config.prefix}${shownUsage}*\nOr reply to a message with it.`);
        return;
      }
      if (input.length > MAX_INPUT) {
        await ctx.reply(`⚠️ That's too long (limit ${MAX_INPUT} characters).`);
        return;
      }
      try {
        await ctx.reply(await transform(input, ctx));
      } catch (err) {
        await ctx.reply(`⚠️ ${err.message}`);
      }
    },
  };
}

// Regional-indicator letters render as the big boxed letters people expect
// from "big text" on WhatsApp.
function toBigText(input) {
  return [...input.toUpperCase()]
    .map((ch) => {
      if (ch >= 'A' && ch <= 'Z') {
        return String.fromCodePoint(0x1f1e6 + (ch.charCodeAt(0) - 65)) + ' ';
      }
      if (ch === ' ') return '   ';
      return `${ch} `;
    })
    .join('')
    .trim();
}

function titleCase(input) {
  return input
    .toLowerCase()
    .replace(/(^|\s|["'(\-])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());
}

// A locale the bot owner can see themselves in, rather than whatever the
// server happens to be set to.
const TIME_ZONE = process.env.TZ || undefined;

function formatNow(options) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, ...options }).format(new Date());
}

module.exports = [
  buildTextCommand({
    name: 'ascii',
    aliases: ['asciiart'],
    description: 'Draws text as block-letter ASCII art (12 characters max).',
    usage: 'ascii <text>',
    transform: (input) => `\`\`\`${toAsciiArt(input)}\`\`\``,
  }),

  buildTextCommand({
    name: 'bigtext',
    aliases: ['big'],
    description: 'Turns text into large emoji letters.',
    usage: 'bigtext <text>',
    transform: (input) => {
      if (input.length > 40) throw new Error('Keep it under 40 characters for big text.');
      return toBigText(input);
    },
  }),

  buildTextCommand({
    name: 'quote',
    description: 'Formats text as a pull-quote.',
    usage: 'quote <text>',
    transform: (input, ctx) => {
      const quoted = getQuotedInfo(ctx.msg);
      const author = quoted?.participant ? `@${quoted.participant.split('@')[0]}` : '';
      const body = input
        .split('\n')
        .map((line) => `> _${line}_`)
        .join('\n');
      return `❝\n${body}\n❞${author ? `\n\n— ${author}` : ''}`;
    },
  }),

  buildTextCommand({
    name: 'bold',
    description: 'Wraps text in WhatsApp bold formatting.',
    usage: 'bold <text>',
    transform: (input) => `*${input.replace(/\*/g, '')}*`,
  }),

  buildTextCommand({
    name: 'italic',
    description: 'Wraps text in WhatsApp italic formatting.',
    usage: 'italic <text>',
    transform: (input) => `_${input.replace(/_/g, '')}_`,
  }),

  buildTextCommand({
    name: 'mono',
    aliases: ['code'],
    description: 'Wraps text in monospace formatting.',
    usage: 'mono <text>',
    transform: (input) => `\`\`\`${input.replace(/`/g, '')}\`\`\``,
  }),

  buildTextCommand({
    name: 'strike',
    aliases: ['strikethrough'],
    description: 'Wraps text in strikethrough formatting.',
    usage: 'strike <text>',
    transform: (input) => `~${input.replace(/~/g, '')}~`,
  }),

  buildTextCommand({
    name: 'upper',
    aliases: ['uppercase'],
    description: 'UPPERCASES text.',
    usage: 'upper <text>',
    transform: (input) => input.toUpperCase(),
  }),

  buildTextCommand({
    name: 'lower',
    aliases: ['lowercase'],
    description: 'lowercases text.',
    usage: 'lower <text>',
    transform: (input) => input.toLowerCase(),
  }),

  buildTextCommand({
    name: 'title',
    aliases: ['titlecase'],
    description: 'Converts Text To Title Case.',
    usage: 'title <text>',
    transform: titleCase,
  }),

  buildTextCommand({
    name: 'count',
    aliases: ['wc'],
    description: 'Counts characters, words, lines and sentences.',
    usage: 'count <text>',
    transform: (input) => {
      const words = input.split(/\s+/).filter(Boolean).length;
      const chars = [...input].length;
      const noSpaces = [...input.replace(/\s/g, '')].length;
      const lines = input.split('\n').length;
      const sentences = input.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length;
      // ~200 wpm is the usual reading-speed estimate.
      const readSeconds = Math.max(1, Math.round((words / 200) * 60));
      return (
        `🔢 *Count*\n\n` +
        `• Characters: ${chars} (${noSpaces} without spaces)\n` +
        `• Words: ${words}\n` +
        `• Sentences: ${sentences}\n` +
        `• Lines: ${lines}\n` +
        `• Reading time: ~${readSeconds}s`
      );
    },
  }),

  {
    name: 'time',
    description: 'Shows the current time.',
    category: 'tools',
    usage: 'time',
    cooldown: 2,
    async handler({ reply }) {
      await reply(`🕒 ${formatNow({ hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
    },
  },

  {
    name: 'date',
    description: 'Shows today\'s date.',
    category: 'tools',
    usage: 'date',
    cooldown: 2,
    async handler({ reply }) {
      await reply(`📅 ${formatNow({ day: '2-digit', month: 'long', year: 'numeric' })}`);
    },
  },

  {
    name: 'day',
    description: 'Shows what day it is.',
    category: 'tools',
    usage: 'day',
    cooldown: 2,
    async handler({ reply }) {
      await reply(`🗓️ It's *${formatNow({ weekday: 'long' })}*.`);
    },
  },

  {
    name: 'random',
    aliases: ['rand', 'rng'],
    description: 'Random number. Give a max, or a min and a max.',
    category: 'tools',
    usage: 'random [min] [max]',
    cooldown: 2,
    async handler({ args, reply }) {
      let min = 1;
      let max = 100;

      if (args.length === 1) max = Number(args[0]);
      if (args.length >= 2) {
        min = Number(args[0]);
        max = Number(args[1]);
      }

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        await reply(`⚠️ Give me numbers, e.g. *${config.prefix}random 1 100*`);
        return;
      }

      min = Math.ceil(min);
      max = Math.floor(max);
      if (min > max) [min, max] = [max, min];
      if (max - min > 1e9) {
        await reply('⚠️ That range is too wide.');
        return;
      }

      await reply(`🎲 *${crypto.randomInt(min, max + 1)}*  _(${min}–${max})_`);
    },
  },

  {
    name: 'pin',
    description: 'Generates a random numeric PIN.',
    category: 'tools',
    usage: 'pin [length]',
    cooldown: 2,
    async handler({ args, reply }) {
      const length = Math.min(12, Math.max(4, Number(args[0]) || 4));
      let out = '';
      for (let i = 0; i < length; i += 1) out += crypto.randomInt(10);
      await reply(`🔢 *${length}-digit PIN*\n\`\`\`${out}\`\`\``);
    },
  },

  {
    name: 'convert',
    aliases: ['unit'],
    description: 'Converts units: length, weight, temperature, data, time, speed.',
    category: 'tools',
    usage: 'convert <value> <from> [to <to>]',
    cooldown: 2,
    async handler({ args, reply }) {
      if (args.length === 0) {
        await reply(
          `📐 *Convert units*\n\n` +
            `• ${config.prefix}convert 10 km to miles\n` +
            `• ${config.prefix}convert 72 f\n` +
            `• ${config.prefix}convert 500 mb to gb\n\n` +
            `Supported: ${listUnits()}`
        );
        return;
      }

      try {
        await reply(convert(args));
      } catch (err) {
        if (err instanceof ConversionError) {
          await reply(`⚠️ ${err.message}`);
          return;
        }
        await reply("⚠️ I couldn't convert that.");
      }
    },
  },
];
