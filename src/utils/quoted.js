'use strict';

/**
 * Pulls the quoted/replied-to message out of an incoming message's
 * contextInfo, wherever it happens to live depending on the message type
 * that carried the reply (plain text reply, or a reply sent with a caption
 * on media/etc).
 *
 * Returns null if this message isn't a reply to anything.
 */
function getQuotedInfo(msg) {
  const contextInfo =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.conversation?.contextInfo;

  const quotedMessage = contextInfo?.quotedMessage;
  if (!quotedMessage) return null;

  return {
    message: quotedMessage,
    stanzaId: contextInfo.stanzaId,
    participant: contextInfo.participant,
  };
}

/**
 * Builds a minimal fake "msg" object around a quoted message so it can be
 * handed to Baileys' downloadMediaMessage / normalizeMessageContent, which
 * expect a full `{ key, message }` shape rather than the bare contextInfo
 * fragment WhatsApp gives us.
 */
function buildFakeMessage({ quoted, remoteJid, message = quoted.message }) {
  return {
    key: {
      remoteJid,
      id: quoted.stanzaId,
      participant: quoted.participant,
      fromMe: false,
    },
    message,
  };
}

module.exports = { getQuotedInfo, buildFakeMessage };
