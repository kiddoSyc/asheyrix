'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

module.exports = buildToggleCommand({
  name: 'antilink',
  aliases: ['al'],
  description: 'When ON, removes WhatsApp group-invite links posted by non-admins.',
  settingKey: 'antiLink',
  category: 'group',
});
