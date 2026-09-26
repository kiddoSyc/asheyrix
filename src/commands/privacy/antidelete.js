'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

module.exports = buildToggleCommand({
  name: 'antidelete',
  aliases: ['ad'],
  description: 'When ON, resends messages to the owner if the sender deletes them for everyone (only works for messages seen while ON).',
  settingKey: 'antiDelete',
});
