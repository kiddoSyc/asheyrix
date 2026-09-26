'use strict';

function formatDuration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

module.exports = {
  name: 'uptime',
  aliases: ['runtime'],
  description: 'Shows how long the bot process has been running.',
  category: 'tools',
  usage: 'uptime',
  cooldown: 3,
  async handler({ reply }) {
    await reply(`⏱️ Uptime: *${formatDuration(process.uptime())}*`);
  },
};
