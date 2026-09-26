'use strict';

const { config } = require('../../config');
const { runImageGeneration } = require('../../lib/imageCommandHelper');

const STYLE =
  'Beautiful high-resolution wallpaper of {subject}. ' +
  'Atmospheric depth, rich colour, cinematic lighting, clean uncluttered composition ' +
  'with calm empty space so icons and widgets stay readable on top. No text, no watermark.';

// The orientation keyword can be anywhere in the prompt, so someone can
// write "wallpaper desktop misty forest" or "wallpaper misty forest desktop"
// and get the same result.
const DESKTOP_WORDS = ['desktop', 'pc', 'laptop', 'wide', 'landscape'];
const PHONE_WORDS = ['phone', 'mobile', 'portrait'];

function parseOrientation(text) {
  const words = text.split(/\s+/);
  const kept = [];
  let size = 'phone'; // phones are where a WhatsApp bot's output actually lands

  for (const word of words) {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (DESKTOP_WORDS.includes(lower)) {
      size = 'desktop';
      continue;
    }
    if (PHONE_WORDS.includes(lower)) {
      size = 'phone';
      continue;
    }
    kept.push(word);
  }

  return { size, subject: kept.join(' ').trim() };
}

module.exports = {
  name: 'wallpaper',
  aliases: ['wp'],
  description: 'Generates a phone or desktop wallpaper from a description.',
  category: 'imageai',
  usage: 'wallpaper [phone|desktop] <description>',
  cooldown: 15,
  async handler(ctx) {
    const { size, subject } = parseOrientation(ctx.text.trim());

    await runImageGeneration(ctx, {
      prompt: STYLE.replace('{subject}', subject),
      size,
      caption: `🖥️ *Wallpaper* (${size}) — ${subject}`,
      emptyHint:
        `Describe the wallpaper: *${config.prefix}wallpaper misty pine forest at dawn*\n` +
        `Add *desktop* for a wide one: *${config.prefix}wallpaper desktop misty pine forest*`,
    });
  },
};
