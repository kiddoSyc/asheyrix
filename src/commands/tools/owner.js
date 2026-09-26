'use strict';

module.exports = {
  name: 'owner',
  aliases: [],
  description: "Sends the bot owner's contact card.",
  category: 'tools',
  usage: 'owner',
  cooldown: 5,
  async handler({ sock, from, msg, config, reply }) {
    if (config.ownerNumbers.length === 0) {
      await reply('No owner number is configured.');
      return;
    }

    const ownerNumber = config.ownerNumbers[0];
    const vcard =
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      `FN:${config.botName} Owner\n` +
      `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\n` +
      'END:VCARD';

    await sock.sendMessage(
      from,
      { contacts: { displayName: `${config.botName} Owner`, contacts: [{ vcard }] } },
      { quoted: msg }
    );
  },
};
