'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

module.exports = buildToggleCommand({
  name: 'adminmode',
  aliases: ['am'],
  description: 'When ON, only group admins can use bot commands in groups (owner is always exempt).',
  settingKey: 'groupAdminOnly',
  category: 'group',
});
