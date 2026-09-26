'use strict';

/**
 * Offline smoke test: runs every command handler with a fake context and
 * reports anything that throws. Commands that need the network (music
 * downloads) are expected to fail gracefully with a reply, not a throw.
 *
 * Run with: node scripts/smoke-test.js
 */

const path = require('path');
const { loadCommands } = require('../src/handlers/commandLoader');
const { config } = require('../src/config');

const commands = loadCommands(path.join(__dirname, '..', 'src', 'commands'));

const SAMPLES = {
  make: 'I am happy',
  ascii: 'HI',
  bigtext: 'hey',
  quote: 'to be or not to be',
  bold: 'hello',
  italic: 'hello',
  mono: 'hello',
  strike: 'hello',
  reverse: 'hello',
  count: 'one two three. four!',
  upper: 'hello',
  lower: 'HELLO',
  title: 'hello there world',
  calc: '(18 + 4) * 3',
  convert: '10 km to miles',
  random: '1 10',
  password: '16',
  pin: '6',
  uuid: '1',
  qr: 'https://example.com',
  encode: 'hello',
  decode: 'aGVsbG8=',
  define: 'serendipity',
  quality: 'high',
  history: '',
  favorites: '',
  cancel: '',
  lyrics: 'test song',
};

const TARGETS = Object.keys(SAMPLES).concat(['time', 'date', 'day', 'health']);

async function run() {
  const failures = [];
  const replies = [];

  for (const name of TARGETS) {
    const command = commands.byName.get(name);
    if (!command) {
      failures.push(`${name}: command not registered`);
      continue;
    }

    const text = SAMPLES[name] || '';
    const ctx = {
      sock: {
        sendMessage: async () => ({}),
        sendPresenceUpdate: async () => {},
      },
      msg: { key: { remoteJid: 'test@s.whatsapp.net', id: 'X' }, message: { conversation: text } },
      from: 'test@s.whatsapp.net',
      sender: 'test@s.whatsapp.net',
      isGroup: false,
      isOwner: true,
      args: text ? text.split(/\s+/) : [],
      text,
      config,
      commands,
      reply: async (content) => {
        replies.push([name, String(typeof content === 'string' ? content : content.text).slice(0, 80)]);
      },
    };

    try {
      await command.handler(ctx);
    } catch (err) {
      failures.push(`${name}: threw ${err.message}`);
    }
  }

  for (const [name, reply] of replies) {
    console.log(`  ${name.padEnd(12)} -> ${reply.replace(/\n/g, ' ⏎ ')}`);
  }

  console.log(`\n${TARGETS.length} commands exercised, ${failures.length} failure(s).`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}

run();
