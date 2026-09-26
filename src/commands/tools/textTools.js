'use strict';

const crypto = require('crypto');
const { config } = require('../../config');
const { getQuotedInfo } = require('../../utils/quoted');
const { extractText } = require('../../utils/messageContent');
const { evaluate, CalcError } = require('../../lib/safeCalculator');

/**
 * Small, dependency-free utilities. Each one is a few lines of real work
 * wrapped in the same "did you give me text?" boilerplate, so they share a
 * helper and live in one file (commandLoader accepts an array export).
 */

const MAX_INPUT = 4000;

/**
 * Resolves the text a command should act on: typed arguments first, then
 * the message being replied to. Replying is usually what you want — you
 * rarely retype something you're trying to transform.
 */
function targetText(ctx) {
  const typed = (ctx.text || '').trim();
  if (typed) return typed;

  const quoted = getQuotedInfo(ctx.msg);
  return quoted ? extractText(quoted.message).trim() : '';
}

function buildTextCommand({ name, aliases = [], description, usage, transform, cooldown = 3 }) {
  return {
    name,
    aliases,
    description,
    category: 'tools',
    usage: usage || `${name} <text>`,
    cooldown,
    async handler(ctx) {
      const input = targetText(ctx);

      if (!input) {
        await ctx.reply(`Give me some text: *${config.prefix}${usage || `${name} <text>`}*\nOr reply to a message with it.`);
        return;
      }
      if (input.length > MAX_INPUT) {
        await ctx.reply(`⚠️ That's too long (limit ${MAX_INPUT} characters).`);
        return;
      }

      try {
        const output = await transform(input, ctx);
        await ctx.reply(output);
      } catch (err) {
        await ctx.reply(`⚠️ ${err.message}`);
      }
    },
  };
}

// --- morse ---------------------------------------------------------------

const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....',
  i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.',
  q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-',
  y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-',
  ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '"': '.-..-.', '@': '.--.-.',
};

const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

// --- fancy text ----------------------------------------------------------

const PLAIN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Unicode "mathematical alphanumeric" ranges — these render as styled text
// almost everywhere, unlike WhatsApp's own formatting which is limited to
// bold/italic/strike/mono.
const FANCY_STYLES = {
  bold: 0x1d400, // 𝐀
  italic: 0x1d434, // 𝐴
  script: 0x1d49c, // 𝒜
  fraktur: 0x1d504, // 𝔄
  double: 0x1d538, // 𝔸
  mono: 0x1d670, // 𝙰
};

function toFancy(text, styleName) {
  const base = FANCY_STYLES[styleName];
  if (!base) throw new Error(`Unknown style. Try: ${Object.keys(FANCY_STYLES).join(', ')}`);

  return [...text]
    .map((ch) => {
      const index = PLAIN.indexOf(ch);
      if (index === -1) return ch;
      // Uppercase occupies the first 26 code points, lowercase the next 26.
      const offset = index < 26 ? index + 26 : index - 26;
      return String.fromCodePoint(base + offset);
    })
    .join('');
}

module.exports = [
  {
    name: 'calc',
    aliases: ['math', 'c'],
    description: 'Works out a maths expression. Supports + - * / % ^, brackets, sqrt, sin, pi.',
    category: 'tools',
    usage: 'calc <expression>',
    cooldown: 2,
    async handler({ text, reply }) {
      const expression = (text || '').trim();
      if (!expression) {
        await reply(
          `🧮 Give me something to work out.\n\n` +
            `• ${config.prefix}calc (18 + 4) * 3\n` +
            `• ${config.prefix}calc sqrt(144) + 2^10\n` +
            `• ${config.prefix}calc 15% of... — use 0.15 * <number>`
        );
        return;
      }

      try {
        const result = evaluate(expression);
        // Long decimals from floating point are noise; trim without lying
        // about integers.
        const pretty = Number.isInteger(result) ? String(result) : String(Number(result.toPrecision(12)));
        await reply(`🧮 \`${expression}\`\n\n= *${pretty}*`);
      } catch (err) {
        if (err instanceof CalcError) {
          await reply(`⚠️ ${err.message}`);
          return;
        }
        await reply("⚠️ I couldn't parse that expression.");
      }
    },
  },

  buildTextCommand({
    name: 'encode',
    aliases: ['b64', 'base64'],
    description: 'Encodes text to base64.',
    usage: 'encode <text>',
    transform: (input) => `\`\`\`${Buffer.from(input, 'utf8').toString('base64')}\`\`\``,
  }),

  buildTextCommand({
    name: 'decode',
    aliases: ['unb64', 'unbase64'],
    description: 'Decodes base64 back to text.',
    usage: 'decode <base64>',
    transform: (input) => {
      const cleaned = input.replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) throw new Error("That doesn't look like base64.");
      const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
      if (!decoded) throw new Error('That decoded to nothing.');
      return decoded;
    },
  }),

  buildTextCommand({
    name: 'hash',
    aliases: ['sha256', 'md5'],
    description: 'Hashes text (sha256 by default; add md5 or sha1 as the first word).',
    usage: 'hash [md5|sha1|sha256|sha512] <text>',
    transform: (input) => {
      const supported = ['md5', 'sha1', 'sha256', 'sha512'];
      const [first, ...rest] = input.split(/\s+/);

      const algorithm = supported.includes(first.toLowerCase()) ? first.toLowerCase() : 'sha256';
      const payload = supported.includes(first.toLowerCase()) ? rest.join(' ') : input;

      if (!payload) throw new Error('Give me something to hash after the algorithm name.');

      const digest = crypto.createHash(algorithm).update(payload, 'utf8').digest('hex');
      return `🔑 *${algorithm}*\n\`\`\`${digest}\`\`\``;
    },
  }),

  buildTextCommand({
    name: 'morse',
    description: 'Converts text to morse code, or morse back to text.',
    usage: 'morse <text or morse>',
    transform: (input) => {
      // If it's only dots, dashes, spaces and slashes, assume they want decoding.
      const looksLikeMorse = /^[.\-/\s]+$/.test(input);

      if (looksLikeMorse) {
        const decoded = input
          .trim()
          .split('/')
          .map((word) =>
            word
              .trim()
              .split(/\s+/)
              .map((code) => MORSE_REVERSE[code] || '?')
              .join('')
          )
          .join(' ');
        return `📻 ${decoded}`;
      }

      const encoded = input
        .toLowerCase()
        .split(' ')
        .map((word) =>
          [...word]
            .map((ch) => MORSE[ch] || '')
            .filter(Boolean)
            .join(' ')
        )
        .join(' / ');

      if (!encoded.replace(/[\s/]/g, '')) throw new Error('Nothing in there can be written in morse.');
      return `📻 \`\`\`${encoded}\`\`\``;
    },
  }),

  buildTextCommand({
    name: 'binary',
    aliases: ['bin'],
    description: 'Converts text to binary, or binary back to text.',
    usage: 'binary <text or binary>',
    transform: (input) => {
      const looksLikeBinary = /^[01\s]+$/.test(input) && input.replace(/\s/g, '').length % 8 === 0;

      if (looksLikeBinary) {
        const bits = input.replace(/\s/g, '');
        let out = '';
        for (let i = 0; i < bits.length; i += 8) {
          out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
        }
        return `💾 ${out}`;
      }

      const encoded = [...input]
        .map((ch) => ch.charCodeAt(0).toString(2).padStart(8, '0'))
        .join(' ');
      return `💾 \`\`\`${encoded}\`\`\``;
    },
  }),

  buildTextCommand({
    name: 'reverse',
    aliases: ['rev'],
    description: 'Reverses text. Handles emoji correctly.',
    usage: 'reverse <text>',
    // [...str] splits by code point, so multi-byte emoji survive the flip.
    transform: (input) => [...input].reverse().join(''),
  }),

  buildTextCommand({
    name: 'mock',
    description: 'cOnVeRtS tExT lIkE tHiS.',
    usage: 'mock <text>',
    transform: (input) =>
      [...input].map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join(''),
  }),

  buildTextCommand({
    name: 'fancy',
    aliases: ['style', 'font'],
    description: 'Restyles text in unicode fonts (bold, italic, script, fraktur, double, mono).',
    usage: 'fancy <style> <text>',
    transform: (input) => {
      const [maybeStyle, ...rest] = input.split(/\s+/);
      const style = maybeStyle.toLowerCase();

      if (!FANCY_STYLES[style]) {
        // No style given — show them all rather than erroring out.
        const samples = Object.keys(FANCY_STYLES)
          .map((s) => `${s}: ${toFancy(input.slice(0, 20), s)}`)
          .join('\n');
        return `✨ Pick a style with *${config.prefix}fancy <style> <text>*\n\n${samples}`;
      }

      const payload = rest.join(' ');
      if (!payload) throw new Error('Give me some text after the style name.');
      return toFancy(payload, style);
    },
  }),

  {
    name: 'password',
    aliases: ['pass', 'genpass'],
    description: 'Generates a strong random password.',
    category: 'tools',
    usage: 'password [length]',
    cooldown: 2,
    async handler({ args, reply }) {
      const requested = Number(args[0]) || 20;
      const length = Math.min(64, Math.max(8, requested));

      const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+';

      // crypto.randomInt is rejection-sampled, so this has no modulo bias —
      // which matters rather a lot for something people will actually use.
      let out = '';
      for (let i = 0; i < length; i += 1) {
        out += alphabet[crypto.randomInt(alphabet.length)];
      }

      await reply(
        `🔐 *${length}-character password*\n\n\`\`\`${out}\`\`\`\n\n` +
          `_Sent over WhatsApp, so treat it as compromised if this chat is ever backed up or shared._`
      );
    },
  },

  {
    name: 'uuid',
    description: 'Generates a random UUID v4.',
    category: 'tools',
    usage: 'uuid [count]',
    cooldown: 2,
    async handler({ args, reply }) {
      const count = Math.min(10, Math.max(1, Number(args[0]) || 1));
      const ids = Array.from({ length: count }, () => crypto.randomUUID());
      await reply(`\`\`\`${ids.join('\n')}\`\`\``);
    },
  },
];
