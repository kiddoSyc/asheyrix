'use strict';

const QRCode = require('qrcode');
const logger = require('../../utils/logger');

module.exports = {
  name: 'qr',
  aliases: [],
  description: 'Generates a scannable QR code image from text or a link.',
  category: 'media',
  usage: 'qr <text or link>',
  cooldown: 5,
  async handler({ text, sock, from, msg, reply }) {
    if (!text) {
      await reply('Usage: .qr <text or link>');
      return;
    }
    try {
      const buffer = await QRCode.toBuffer(text, { type: 'png', width: 512, margin: 1 });
      await sock.sendMessage(from, { image: buffer, caption: `QR: ${text}` }, { quoted: msg });
    } catch (err) {
      logger.error({ err }, 'QR generation failed.');
      await reply('❌ Failed to generate QR code.');
    }
  },
};
