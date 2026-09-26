'use strict';

const logger = require('./logger');

/**
 * Checks whether a given JID is an admin (or superadmin) in a group.
 * Fails closed (returns false) if group metadata can't be fetched — an
 * unverifiable admin claim should never be treated as "yes, go ahead."
 */
async function isSenderGroupAdmin(sock, groupJid, senderJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const participant = metadata.participants.find((p) => p.id === senderJid);
    return Boolean(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
  } catch (err) {
    logger.warn({ err, groupJid }, 'Could not verify group admin status — denying by default.');
    return false;
  }
}

/**
 * Checks whether the bot's own account is an admin in a group — several
 * group actions (kick/promote/mute/etc.) silently fail on WhatsApp's side
 * if the bot isn't, so commands can check this first and give a clear
 * error instead of a confusing generic failure.
 */
async function isBotGroupAdmin(sock, groupJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const botNumber = sock.user?.id?.split(':')[0]?.split('@')[0];
    const participant = metadata.participants.find((p) => p.id.split('@')[0] === botNumber);
    return Boolean(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
  } catch (err) {
    logger.warn({ err, groupJid }, 'Could not verify bot admin status.');
    return false;
  }
}

module.exports = { isSenderGroupAdmin, isBotGroupAdmin };
