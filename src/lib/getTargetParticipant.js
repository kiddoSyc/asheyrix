'use strict';

/**
 * Resolves who a group-management command is targeting: whoever was
 * @mentioned, or (if no mention) whoever's message is being replied to.
 */
function getTargetParticipant(msg) {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (contextInfo?.mentionedJid?.length) return contextInfo.mentionedJid[0];
  if (contextInfo?.participant) return contextInfo.participant;
  return null;
}

module.exports = { getTargetParticipant };
