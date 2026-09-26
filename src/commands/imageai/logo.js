'use strict';

const { config } = require('../../config');
const { runImageGeneration } = require('../../lib/imageCommandHelper');

/**
 * A logo is just a generation with a heavily-opinionated prompt wrapper.
 * The styling text does the work that a user would otherwise have to know
 * to write themselves — flat vector, clean background, no stray lettering —
 * which is the difference between a usable mark and a cluttered
 * illustration.
 */
const STYLE =
  'Professional flat vector logo design of {subject}. ' +
  'Clean minimal geometric shapes, bold simple silhouette, balanced negative space, ' +
  'limited colour palette, centred composition on a plain white background. ' +
  'Crisp edges, scalable icon style, no photographic texture, no gradients, no mockup.';

module.exports = {
  name: 'logo',
  aliases: ['makelogo'],
  description: 'Generates a logo from a description.',
  category: 'imageai',
  usage: 'logo <brand or idea>',
  cooldown: 15,
  async handler(ctx) {
    const subject = ctx.text.trim();
    await runImageGeneration(ctx, {
      prompt: STYLE.replace('{subject}', subject),
      size: 'square',
      caption: `🏷️ *Logo* — ${subject}`,
      emptyHint: `Describe the brand: *${config.prefix}logo a coffee roastery called Ember*`,
    });
  },
};
