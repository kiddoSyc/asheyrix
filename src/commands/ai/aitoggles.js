'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

/**
 * The on/off switches for the AI system.
 *
 * These are separate command names rather than ".ai on" because ".ai" is
 * the chat command — "ai on" would be a perfectly valid thing to ask a
 * model, and swallowing it as a toggle would be surprising.
 */
module.exports = [
  buildToggleCommand({
    name: 'aichat',
    aliases: ['aienable'],
    description: 'Master switch for every AI command.',
    settingKey: 'aiEnabled',
    category: 'ai',
  }),
  buildToggleCommand({
    name: 'aiauto',
    aliases: ['autoai'],
    description: 'When ON, the bot answers DMs with AI even without a command prefix.',
    settingKey: 'aiAutoReply',
    category: 'ai',
  }),
];
