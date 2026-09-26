'use strict';

const { jidToNumber } = require('./jid');

/**
 * Checks whether a given sender JID belongs to a configured owner number.
 */
function isOwner(senderJid, ownerNumbers = []) {
  const number = jidToNumber(senderJid);
  return ownerNumbers.includes(number);
}

/**
 * Decides whether the bot should process a command at all, based on
 * BOT_MODE. This runs before individual command permission checks.
 *
 * - public  -> everyone allowed
 * - private -> only the owner(s) allowed
 * - self    -> only messages sent by the bot's own account (fromMe) allowed
 */
function isAllowedByMode({ botMode, senderIsOwner, isFromMe }) {
  switch (botMode) {
    case 'public':
      return true;
    case 'private':
      return senderIsOwner || isFromMe;
    case 'self':
      return isFromMe;
    default:
      // Fail closed: unknown mode should not silently grant access.
      return senderIsOwner;
  }
}

module.exports = { isOwner, isAllowedByMode };
