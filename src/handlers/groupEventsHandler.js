'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');

/**
 * Wires up welcome/goodbye messages. Baileys emits one 'group-participants.update'
 * event per action (add/remove/promote/demote), each carrying the affected
 * participant JIDs — we only care about 'add' and 'remove' here.
 */
function registerGroupEventsHandler(sock) {
  sock.ev.on('group-participants.update', async ({ id: groupJid, participants, action }) => {
    try {
      if (action === 'add' && config.welcomeEnabled) {
        await sendGroupGreeting(sock, groupJid, participants, 'welcome');
      } else if (action === 'remove' && config.goodbyeEnabled) {
        await sendGroupGreeting(sock, groupJid, participants, 'goodbye');
      }
    } catch (err) {
      logger.error({ err, groupJid, action }, 'Failed to send a welcome/goodbye message.');
    }
  });
}

async function sendGroupGreeting(sock, groupJid, participants, kind) {
  let groupName = 'the group';
  try {
    const metadata = await sock.groupMetadata(groupJid);
    groupName = metadata.subject || groupName;
  } catch (err) {
    logger.warn({ err, groupJid }, 'Could not fetch group name for greeting message.');
  }

  const mentions = participants;
  const names = participants.map((jid) => `@${jid.split('@')[0]}`).join(', ');

  const text =
    kind === 'welcome'
      ? `👋 Welcome ${names} to *${groupName}*!`
      : `👋 ${names} left *${groupName}*. Goodbye!`;

  await sock.sendMessage(groupJid, { text, mentions });
}

module.exports = { registerGroupEventsHandler };
