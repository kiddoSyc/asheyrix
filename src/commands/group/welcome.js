'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

module.exports = buildToggleCommand({
  name: 'welcome',
  aliases: [],
  description: 'When ON, greets new members when they join the group.',
  settingKey: 'welcomeEnabled',
  category: 'group',
});
