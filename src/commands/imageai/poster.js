'use strict';

const { config } = require('../../config');
const { runImageGeneration } = require('../../lib/imageCommandHelper');

const STYLE =
  'Striking graphic poster design about {subject}. ' +
  'Bold composition with a clear focal point, strong colour contrast, dramatic lighting, ' +
  'generous margins and space reserved for a headline. Modern editorial print-poster ' +
  'aesthetic, high detail, portrait orientation.';

module.exports = {
  name: 'poster',
  aliases: ['makeposter'],
  description: 'Generates a poster from a description.',
  category: 'imageai',
  usage: 'poster <subject or event>',
  cooldown: 15,
  async handler(ctx) {
    const subject = ctx.text.trim();
    await runImageGeneration(ctx, {
      prompt: STYLE.replace('{subject}', subject),
      // Posters are portrait by convention, and the shape matters more here
      // than in any other preset.
      size: 'portrait',
      caption: `🖼️ *Poster* — ${subject}`,
      emptyHint: `Describe the poster: *${config.prefix}poster a jazz night at a rooftop bar*`,
    });
  },
};
