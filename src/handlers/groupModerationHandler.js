'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');
const { extractText } = require('../utils/messageContent');
const { isGroupJid } = require('../utils/jid');
const { isSenderGroupAdmin } = require('../utils/groupPermissions');
const { addWarning } = require('../database/warningsStore');
const { subscribeToMessages } = require('./messageBus');

// Deliberately scoped to WhatsApp's own group-invite links, not arbitrary
// URLs — that's the conventional meaning of "anti-link" in WA bots (stop
// people advertising other groups), not a general link ban, which would be
// surprising default behavior for a personal bot.
const INVITE_LINK_PATTERN = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;

function registerGroupModerationHandler(sock) {
  subscribeToMessages(({ messages, type }) => {
    if (type !== 'notify') return;
    if (!config.antiLink) return;

    for (const msg of messages) {
      handleOne(sock, msg).catch((err) => {
        logger.error({ err }, 'Group moderation handler failed on a message (skipped, bot kept running).');
      });
    }
  }, { name: 'groupModeration' });
}

async function handleOne(sock, msg) {
  if (!msg.message) return;
  const groupJid = msg.key.remoteJid;
  if (!isGroupJid(groupJid)) return;
  if (msg.key.fromMe) return;

  const text = extractText(msg.message);
  if (!INVITE_LINK_PATTERN.test(text)) return;

  const sender = msg.key.participant || groupJid;

  // Never moderate admins or the bot owner — this exists to stop random
  // members advertising other groups, not to restrict the people running
  // the group.
  if (config.ownerNumbers.includes(sender.split('@')[0])) return;
  const senderIsAdmin = await isSenderGroupAdmin(sock, groupJid, sender);
  if (senderIsAdmin) return;

  try {
    await sock.sendMessage(groupJid, { delete: msg.key });
  } catch (err) {
    logger.warn({ err, groupJid }, 'Anti-link: could not delete the message (bot may not be an admin here).');
  }

  const count = addWarning(groupJid, sender, 'Posted a group invite link');
  try {
    await sock.sendMessage(groupJid, {
      text: `🔗 Group links aren't allowed here. @${sender.split('@')[0]} has been warned (${count}).`,
      mentions: [sender],
    });
  } catch (err) {
    logger.warn({ err, groupJid }, 'Anti-link: could not send the warning notice.');
  }
}

module.exports = { registerGroupModerationHandler };
