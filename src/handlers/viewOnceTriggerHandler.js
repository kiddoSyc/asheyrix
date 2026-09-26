'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');
const { isOwner } = require('../utils/permissions');
const { extractText, unwrapMessage } = require('../utils/messageContent');
const { extractViewOnceContent, describeViewOnceMedia } = require('../utils/viewOnce');
const { getQuotedInfo, buildFakeMessage } = require('../utils/quoted');
const { recallViewOnce } = require('../utils/viewOnceCache');
const { unlockAndSend, notifyOwners } = require('../lib/viewOnceDelivery');
const { subscribeToMessages } = require('./messageBus');

/**
 * Two prefix-less ways to unlock a View Once message, both owner-only, both
 * delivering to the owner's DM and leaving zero trace in the original chat:
 *
 *   1. Reply to it with the trigger word (default "waw").
 *   2. React to it with the trigger emoji (default 👀).
 *
 * These are NOT equally reliable, and it's worth knowing why:
 *
 *   A reply carries the entire quoted message — including the mediaKey — in
 *   contextInfo. That's handed to the bot at trigger time, so it can always
 *   download. This is the dependable path.
 *
 *   A reaction carries only the *key* of the target message: chat id,
 *   message id, participant. No content. No mediaKey. Nothing downloadable.
 *   The bot can only act on it if it already stashed the original when it
 *   first came through the upsert stream (see utils/viewOnceCache.js) — and
 *   since the June 2024 protocol change, WhatsApp frequently withholds the
 *   decryption key on that first delivery. So the emoji trigger works when
 *   it works, and cleanly reports failure to your DM when it doesn't.
 *
 * Nothing here is ever sent to the chat the media came from, including error
 * messages — a failed unlock must not tip anyone off.
 */

const handled = new Set(); // dedupe against WhatsApp retry redelivery
const HANDLED_MAX = 500;

function markHandled(id) {
  if (!id) return false;
  if (handled.has(id)) return true;
  handled.add(id);
  if (handled.size > HANDLED_MAX) {
    const excess = handled.size - HANDLED_MAX;
    let removed = 0;
    for (const key of handled) {
      handled.delete(key);
      if (++removed >= excess) break;
    }
  }
  return false;
}

function triggeredByOwner(msg) {
  if (msg.key?.fromMe) return true;
  const sender = msg.key?.participant || msg.key?.remoteJid;
  return isOwner(sender, config.ownerNumbers);
}

function registerViewOnceTriggerHandler(sock) {
  subscribeToMessages(({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      handleOne(sock, msg).catch((err) => {
        logger.error({ err }, 'View Once trigger handler failed (skipped, bot kept running).');
      });
    }
  }, { name: 'viewOnceTrigger' });
}

async function handleOne(sock, msg) {
  if (!msg.message) return;
  if (config.ownerNumbers.length === 0) return;

  const content = unwrapMessage(msg.message) || msg.message;

  if (content.reactionMessage) {
    await handleReaction(sock, msg, content.reactionMessage);
    return;
  }

  await handleWordReply(sock, msg);
}

/**
 * Emoji-reaction trigger. Depends entirely on the cache — see the note at
 * the top of this file for why.
 */
async function handleReaction(sock, msg, reaction) {
  const emoji = (reaction.text || '').trim();
  if (!emoji) return; // an empty reaction text means the reaction was removed
  if (emoji !== config.viewOnceTriggerEmoji) return;
  if (!triggeredByOwner(msg)) return;

  const targetKey = reaction.key;
  if (!targetKey?.id || !targetKey?.remoteJid) return;
  if (markHandled(`react:${targetKey.remoteJid}:${targetKey.id}`)) return;

  const entry = recallViewOnce(targetKey.remoteJid, targetKey.id);
  if (!entry) {
    logger.info(
      { id: targetKey.id, chat: targetKey.remoteJid },
      'Reaction trigger fired but that message is not in the View Once cache.'
    );
    await notifyOwners(
      sock,
      `👀 Saw your ${config.viewOnceTriggerEmoji} but I can't unlock that one.\n\n` +
        `Either it wasn't View Once media, it's older than 30 minutes, or WhatsApp never handed me the key when it arrived.\n\n` +
        `Reply *${config.viewOnceTriggerWord}* to the message instead — that always works.`
    );
    return;
  }

  await unlockAndSend({
    sock,
    downloadable: { key: entry.key, message: entry.inner },
    inner: entry.inner,
    media: entry.media,
    senderJid: entry.senderJid,
    chatJid: entry.chatJid,
    trigger: `${config.viewOnceTriggerEmoji} reaction`,
  });
}

/**
 * Reply-word trigger. The reliable path: the quoted message arrives complete.
 */
async function handleWordReply(sock, msg) {
  const text = extractText(msg.message).trim().toLowerCase();
  if (text !== config.viewOnceTriggerWord.toLowerCase()) return;
  if (!triggeredByOwner(msg)) return;
  if (markHandled(`word:${msg.key?.id}`)) return;

  const quoted = getQuotedInfo(msg);
  if (!quoted) {
    await notifyOwners(
      sock,
      `ℹ️ Send *${config.viewOnceTriggerWord}* as a **reply** to a View Once photo, video, or voice note.`
    );
    return;
  }

  const inner = extractViewOnceContent(quoted.message);
  if (!inner) {
    await notifyOwners(
      sock,
      "ℹ️ That message doesn't look like View Once media — or it was already opened before you replied."
    );
    return;
  }

  const media = describeViewOnceMedia(inner);
  if (!media) {
    await notifyOwners(sock, 'ℹ️ Found a View Once wrapper but no recognized media inside it.');
    return;
  }

  const chatJid = msg.key.remoteJid;
  const senderJid = quoted.participant || chatJid;

  await unlockAndSend({
    sock,
    downloadable: buildFakeMessage({ quoted, remoteJid: chatJid, message: inner }),
    inner,
    media,
    senderJid,
    chatJid,
    trigger: `"${config.viewOnceTriggerWord}" reply`,
  });
}

module.exports = { registerViewOnceTriggerHandler };
