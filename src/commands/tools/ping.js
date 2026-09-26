'use strict';

module.exports = {
  name: 'ping',
  aliases: ['p'],
  description: 'Checks whether the bot is alive and measures response latency.',
  category: 'tools',
  usage: 'ping',
  cooldown: 3,
  ownerOnly: false,
  groupOnly: false,
  async handler({ reply }) {
    const start = Date.now();
    await reply('🏓 Pinging...');
    const latency = Date.now() - start;
    await reply(`🏓 Pong! ${latency}ms`);
  },
};
