'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

module.exports = buildToggleCommand({
  name: 'goodbye',
  aliases: [],
  description: 'When ON, sends a message when a member leaves the group.',
  settingKey: 'goodbyeEnabled',
  category: 'group',
});
