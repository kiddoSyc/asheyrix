'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

module.exports = buildToggleCommand({
  name: 'antiviewonce',
  aliases: ['avo'],
  description: 'When ON, captures View Once photos/videos/audio sent to the bot and resends them to the owner.',
  settingKey: 'antiViewOnce',
});
