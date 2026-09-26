'use strict';

const { config } = require('../../config');
const { runImageGeneration } = require('../../lib/imageCommandHelper');

const STYLE =
  'Stylised character avatar portrait of {subject}. ' +
  'Head and shoulders, centred, facing the viewer, friendly expression, ' +
  'clean simple background, soft even lighting, vibrant colours, ' +
  'digital illustration suitable for a profile picture.';

module.exports = {
  name: 'avatar',
  aliases: ['pfp'],
  description: 'Generates a profile-picture avatar from a description.',
  category: 'imageai',
  usage: 'avatar <description>',
  cooldown: 15,
  async handler(ctx) {
    const subject = ctx.text.trim();
    await runImageGeneration(ctx, {
      prompt: STYLE.replace('{subject}', subject),
      // Square, because that's what every platform crops a profile photo to.
      size: 'square',
      caption: `👤 *Avatar* — ${subject}`,
      emptyHint: `Describe the avatar: *${config.prefix}avatar a astronaut cat in a blue helmet*`,
    });
  },
};
