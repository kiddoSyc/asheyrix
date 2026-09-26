'use strict';

const { config } = require('../../config');
const { runImageGeneration } = require('../../lib/imageCommandHelper');

module.exports = {
  name: 'genimage',
  aliases: ['imagine', 'aiimage'],
  description: 'Generates an image from a text prompt.',
  category: 'imageai',
  usage: 'genimage <prompt>',
  cooldown: 15,
  async handler(ctx) {
    await runImageGeneration(ctx, {
      prompt: ctx.text.trim(),
      size: 'square',
      caption: `🎨 ${ctx.text.trim()}`,
      emptyHint: `Describe what you want: *${config.prefix}genimage a red fox in snow, golden hour*`,
    });
  },
};
