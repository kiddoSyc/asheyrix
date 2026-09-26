'use strict';

const { normalizeMessageContent } = require('@whiskeysockets/baileys');
const { unwrapMessage } = require('./messageContent');

/**
 * Detects whether a message is (or contains) View Once content, and if so
 * returns the fully-flattened inner content, ready to download.
 *
 * Shared by the always-on background capture (viewOnceHandler.js) and the
 * manual ".vv" command — both need identical detection logic, just fed
 * from different sources (a live upsert vs. a contextInfo.quotedMessage).
 *
 * Order matters here:
 *   1. Peel only "envelope" wrappers (ephemeral/edited messages) — these
 *      don't change whether something IS View Once, but View Once content
 *      is very often nested a layer inside one of them. Missing this step
 *      was the #1 real-world cause of silent capture failures.
 *   2. Check for a View Once marker at THAT level: either the dedicated
 *      wrapper (viewOnceMessage / V2 / V2Extension) or a `.viewOnce` flag
 *      set directly on the media message (some newer WhatsApp clients skip
 *      the wrapper and just set the flag).
 *
 * Only once View Once is confirmed do we call Baileys' own
 * normalizeMessageContent to fully flatten down to the real media message.
 * We deliberately do NOT call it first — normalizeMessageContent unwraps
 * the View Once wrapper too, which would erase the very signal this
 * function needs to detect in the first place.
 */
function extractViewOnceContent(message) {
  const envelope = unwrapMessage(message);
  if (!envelope) return null;

  const hasWrapper =
    envelope.viewOnceMessage || envelope.viewOnceMessageV2 || envelope.viewOnceMessageV2Extension;

  const hasFlag =
    envelope.imageMessage?.viewOnce || envelope.videoMessage?.viewOnce || envelope.audioMessage?.viewOnce;

  if (!hasWrapper && !hasFlag) return null;

  // Now it's safe to fully flatten — we've already confirmed View Once.
  return normalizeMessageContent(envelope) || envelope;
}

function describeViewOnceMedia(innerMessage) {
  if (!innerMessage) return null;
  if (innerMessage.imageMessage) return { key: 'imageMessage', kind: 'image' };
  if (innerMessage.videoMessage) return { key: 'videoMessage', kind: 'video' };
  if (innerMessage.audioMessage) return { key: 'audioMessage', kind: 'audio' };
  return null;
}

module.exports = { extractViewOnceContent, describeViewOnceMedia };
