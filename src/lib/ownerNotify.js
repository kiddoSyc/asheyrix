'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');

/**
 * Sends a "bot connected" message to every configured owner number.
 * Failure to reach one owner never blocks the others or throws upward.
 */
async function sendConnectNotification(sock) {
  if (!config.sendConnectNotification) return;
  if (config.ownerNumbers.length === 0) {
    logger.warn(
      'SEND_CONNECT_NOTIFICATION is on but OWNER_NUMBERS is empty — nowhere to send it.'
    );
    return;
  }

  const now = new Date().toLocaleString();
  const text =
    `✅ *${config.botName}* is now connected.\n\n` +
    `• Mode: ${config.botMode}\n` +
    `• Prefix: ${config.prefix}\n` +
    `• Time: ${now}\n\n` +
    `Send *${config.prefix}menu* to see available commands.`;

  for (const number of config.ownerNumbers) {
    const jid = `${number}@s.whatsapp.net`;
    try {
      await sock.sendMessage(jid, { text });
    } catch (err) {
      logger.error({ err, jid }, 'Failed to send connect notification to owner.');
    }
  }
}

module.exports = { sendConnectNotification };
