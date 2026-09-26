'use strict';

const { config } = require('../../config');
const { runAiPrompt } = require('../../lib/aiCommandHelper');

module.exports = {
  name: 'ai',
  aliases: ['gpt', 'ask', 'bot', 'chat'],
  description: 'Ask the AI anything. Remembers the last few turns, and can read an image you reply to.',
  category: 'ai',
  usage: 'ai <question>  •  reply to a message or image with .ai',
  ownerOnly: false,
  groupOnly: false,
  cooldown: 5,
  async handler(ctx) {
    await runAiPrompt(ctx, {
      emptyHint:
        `🤖 Ask me something.\n\n` +
        `• ${config.prefix}ai why is the sky blue\n` +
        `• reply to a message with ${config.prefix}ai to ask about it\n` +
        `• reply to an image with ${config.prefix}ai what is this\n` +
        `• ${config.prefix}aiclear wipes our conversation history`,
    });
  },
};
