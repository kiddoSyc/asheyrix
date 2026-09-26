'use strict';

/**
 * WhatsApp frequently nests the "real" message content inside envelope
 * wrappers that don't change what the message *is* for our purposes —
 * most commonly `ephemeralMessage` (disappearing-message chats) and
 * `editedMessage`. A View Once photo sent in a chat that also has
 * disappearing messages on, for example, arrives as
 * `message.ephemeralMessage.message.viewOnceMessageV2.message.imageMessage`
 * — not `message.viewOnceMessageV2...` directly. Anything that inspects
 * `msg.message` without peeling these off first will silently miss a
 * meaningful chunk of real-world messages.
 */
function unwrapMessage(message) {
  let current = message;
  let steps = 0;
  while (current && steps < 5) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
    } else if (current.editedMessage?.message) {
      current = current.editedMessage.message;
    } else {
      break;
    }
    steps += 1;
  }
  return current;
}

function extractText(message) {
  const m = unwrapMessage(message);
  if (!m) return '';
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
}

module.exports = { unwrapMessage, extractText };
