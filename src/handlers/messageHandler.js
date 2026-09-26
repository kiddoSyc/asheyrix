'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');
const { isOwner, isAllowedByMode } = require('../utils/permissions');
const { isGroupJid } = require('../utils/jid');
const { extractText } = require('../utils/messageContent');
const { isSenderGroupAdmin } = require('../utils/groupPermissions');
const { checkRateLimit } = require('../lib/rateLimiter');
const { describeError } = require('../lib/errorHandler');
const { subscribeToMessages } = require('./messageBus');

// cooldownKey ("userJid:commandName") -> timestamp (ms) it becomes available again
const cooldowns = new Map();

// Message-id dedup: WhatsApp's retry protocol (common with self-chat / @lid
// sessions failing to decrypt on the first try) can redeliver the same
// message once a working session is established. Without this, a command
// can silently execute twice for what looks like one message.
const processedMessageIds = new Map(); // messageId -> timestamp handled
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes is plenty for a retry storm
const DEDUP_MAX_ENTRIES = 2000;

// Longest plausible command line. Anything past this is a mistake or an
// attempt to make the parser work hard.
const MAX_COMMAND_LENGTH = 2000;

function isDuplicateMessage(id) {
  if (!id) return false;
  const seenAt = processedMessageIds.get(id);
  return Boolean(seenAt && Date.now() - seenAt < DEDUP_WINDOW_MS);
}

function markMessageProcessed(id) {
  if (!id) return;
  processedMessageIds.set(id, Date.now());

  // Cheap bounded cleanup so this map can't grow forever on a long-running
  // process — trim the oldest half once we pass the cap.
  if (processedMessageIds.size > DEDUP_MAX_ENTRIES) {
    const entries = [...processedMessageIds.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, Math.floor(entries.length / 2));
    for (const [key] of toRemove) processedMessageIds.delete(key);
  }
}

function isOnCooldown(key, seconds) {
  const expiresAt = cooldowns.get(key);
  if (!expiresAt) return 0;
  const remaining = expiresAt - Date.now();
  return remaining > 0 ? remaining : 0;
}

function setCooldown(key, seconds) {
  cooldowns.set(key, Date.now() + seconds * 1000);
}

/**
 * Wires up the message listener on a given socket. Called fresh every time
 * a new socket is created (initial connect + every reconnect).
 */
function registerMessageHandler(sock, { commands }) {
  subscribeToMessages(({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      handleSingleMessage(sock, msg, commands).catch((err) => {
        // A single bad message must never take down the whole listener.
        logger.error({ err }, 'Unhandled error while processing a message.');
      });
    }
  }, { name: 'command' });
}

async function handleSingleMessage(sock, msg, commands) {
  if (!msg.message) return; // e.g. reactions, protocol messages, deletions
  if (msg.key.remoteJid === 'status@broadcast') return; // status handled in a later phase

  const from = msg.key.remoteJid;
  const isFromMe = Boolean(msg.key.fromMe);
  const sender = isFromMe ? sock.user.id : msg.key.participant || from;
  const group = isGroupJid(from);

  const text = extractText(msg.message).trim();

  if (!text.startsWith(config.prefix)) return;

  // A command line has no business being this long. Bailing here keeps a
  // pathological message out of the regex split and the command lookup,
  // and out of the logs.
  if (text.length > MAX_COMMAND_LENGTH) {
    logger.warn({ sender, length: text.length }, 'Ignored an oversized command message.');
    return;
  }

  const senderIsOwner = isOwner(sender, config.ownerNumbers);

  if (!isAllowedByMode({ botMode: config.botMode, senderIsOwner, isFromMe })) {
    return; // silently ignore — do not reveal the bot is filtering
  }

  const withoutPrefix = text.slice(config.prefix.length).trim();
  const [rawCommand, ...args] = withoutPrefix.split(/\s+/);
  const commandName = rawCommand.toLowerCase();
  if (!commandName) return;

  const command = commands.byName.get(commandName);
  if (!command) return; // not a recognized command — stay silent, don't spam errors

  // Owners are exempt: the limiter exists to protect the account from
  // strangers in public groups, and locking the owner out of their own bot
  // mid-incident would be the worst possible moment for it.
  if (!senderIsOwner) {
    const limit = checkRateLimit(sender);
    if (!limit.allowed) {
      if (!limit.silent && limit.message) {
        await safeReply(sock, from, msg, limit.message);
      }
      return;
    }
  }

  const messageId = msg.key?.id;
  if (isDuplicateMessage(messageId)) {
    logger.info(
      { command: command.name, messageId },
      'Ignored duplicate delivery of an already-handled message.'
    );
    return;
  }
  markMessageProcessed(messageId);

  if (command.groupOnly && !group) {
    await safeReply(sock, from, msg, '⚠️ This command can only be used in groups.');
    return;
  }

  if (command.ownerOnly && !senderIsOwner) {
    await safeReply(sock, from, msg, '⛔ This command is restricted to the bot owner.');
    return;
  }

  // Per-command admin gate (group-management commands like .kick/.promote)
  if (command.adminOnly && !senderIsOwner) {
    const senderIsAdmin = group && (await isSenderGroupAdmin(sock, from, sender));
    if (!senderIsAdmin) {
      await safeReply(sock, from, msg, '⛔ This command is restricted to group admins.');
      return;
    }
  }

  // Global "admin-only mode" toggle: when on, non-admins can't use ANY
  // command in a group (owner-only and per-command adminOnly commands
  // already enforced their own checks above, so skip re-checking those).
  if (config.groupAdminOnly && group && !senderIsOwner && !command.ownerOnly && !command.adminOnly) {
    const senderIsAdmin = await isSenderGroupAdmin(sock, from, sender);
    if (!senderIsAdmin) {
      return; // silently ignore, same principle as bot-mode filtering above
    }
  }

  const cooldownKey = `${sender}:${command.name}`;
  const remainingMs = isOnCooldown(cooldownKey, command.cooldown);
  if (remainingMs > 0 && !senderIsOwner) {
    const remainingSec = Math.ceil(remainingMs / 1000);
    await safeReply(
      sock,
      from,
      msg,
      `⏳ Please wait ${remainingSec}s before using *.${command.name}* again.`
    );
    return;
  }

  const context = {
    sock,
    msg,
    from,
    sender,
    isGroup: group,
    isOwner: senderIsOwner,
    args,
    text: args.join(' '),
    config,
    commands,
    reply: (content) => safeReply(sock, from, msg, content),
  };

  try {
    setCooldown(cooldownKey, command.cooldown);
    await command.handler(context);
    logger.info(
      { command: command.name, from, sender, group },
      'Command executed.'
    );
  } catch (err) {
    // describeError decides how much to reveal: a UserFacingError thrown by
    // a command reaches the user intact, anything else becomes a reference
    // code so stack traces and file paths never land in a chat.
    await safeReply(sock, from, msg, describeError(err, { command: command.name, from, sender }));
  }
}

/**
 * Sends a reply while guaranteeing that a failure to send never bubbles up
 * and crashes the caller.
 */
async function safeReply(sock, jid, quotedMsg, content) {
  try {
    const payload = typeof content === 'string' ? { text: content } : content;
    await sock.sendMessage(jid, payload, { quoted: {
      key: {
        remoteJid: "0@s.whatsapp.net",
        fromMe: false,
        participant: "0@s.whatsapp.net"
      },
      message: {
        conversation: "ASHEYRIX"
      }
    } });
  } catch (err) {
    logger.error({ err, jid }, 'Failed to send a reply message.');
  }
}

module.exports = { registerMessageHandler };
