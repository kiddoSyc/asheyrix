'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

module.exports = buildToggleCommand({
  name: 'statussave',
  aliases: ['ss'],
  description: 'When ON, downloads status media and forwards it to the owner.',
  settingKey: 'statusAutoSave',
  category: 'privacy',
});
