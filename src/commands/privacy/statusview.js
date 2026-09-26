'use strict';

const { buildToggleCommand } = require('../../lib/toggleCommand');

module.exports = buildToggleCommand({
  name: 'statusview',
  aliases: ['sv'],
  description: 'When ON, automatically marks contacts\' statuses as viewed.',
  settingKey: 'statusView',
  category: 'privacy',
});
