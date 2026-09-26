'use strict';

const { playTrack } = require('../../lib/musicCommandHelper');

module.exports = [
  {
    name: 'play',
    aliases: ['music'],
    description: 'Searches YouTube for a song and sends the audio.',
    category: 'music',
    usage: 'play <song name or YouTube link>',
    cooldown: 10,
    async handler(ctx) {
      await playTrack(ctx, ctx.text);
    },
  },
  {
    name: 'playvn',
    aliases: ['vn'],
    description: 'Same as .play, but sends the audio as a voice note.',
    category: 'music',
    usage: 'playvn <song name or YouTube link>',
    cooldown: 12,
    async handler(ctx) {
      await playTrack(ctx, ctx.text, { asVoiceNote: true });
    },
  },
];
