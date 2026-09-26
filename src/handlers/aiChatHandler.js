'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');
const { isGroupJid } = require('../utils/jid');
const { isOwner } = require('../utils/permissions');
const { extractText } = require('../utils/messageContent');
const { getQuotedInfo } = require('../utils/quoted');
const { runAiPrompt } = require('../lib/aiCommandHelper');
const { TtlCache } = require('../utils/ttlCache');
const { subscribeToMessages } = require('./messageBus');

/**
 * Lets people talk to the bot without a prefix.
 *
 * Two entry conditions, and both are narrow on purpose — an AI that answers
 * everything it sees is the fastest way to get a bot banned, and in a group
 * it's simply obnoxious:
 *
 *   1. A direct message, when aiAutoReply is on.
 *   2. Any chat where the message @-mentions the bot or replies to one of
 *      the bot's own messages. This works in groups regardless of the
 *      autoReply setting, because it's an unambiguous address.
 *
 * Anything starting with the command prefix is left alone — messageHandler
 * owns those, and double-handling would answer twice.
 */

// Answering the same message twice (WhatsApp retry delivery) would look
// broken and costs a second API call, so ids are remembered briefly.
const answered = new TtlCache({ ttlMs: 5 * 60 * 1000, maxEntries: 500 });

function mentionsBot(msg, sock) {
  const botJid = sock.user?.id;
  if (!botJid) return false;
  const botNumber = botJid.split(':')[0].split('@')[0];

  const contextInfo =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo;

  const mentioned = contextInfo?.mentionedJid || [];
  if (mentioned.some((jid) => jid.split('@')[0] === botNumber)) return true;

  // Replying to something the bot said is the other natural way to address it.
  const quoted = getQuotedInfo(msg);
  if (quoted?.participant && quoted.participant.split('@')[0] === botNumber) return true;

  return false;
}

function registerAiChatHandler(sock, { commands }) {
  subscribeToMessages(({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      handleOne(sock, msg, commands).catch((err) => {
        logger.error({ err }, 'AI auto-reply handler failed (skipped, bot kept running).');
      });
    }
  }, { name: 'aiChat' });
}

async function handleOne(sock, msg, commands) {
  if (!msg.message) return;
  if (msg.key.fromMe) return; // never answer ourselves — that's a loop
  if (msg.key.remoteJid === 'status@broadcast') return;
  if (!config.aiEnabled) return;

  const text = extractText(msg.message).trim();
  if (!text) return;
  if (text.startsWith(config.prefix)) return; // a command; not ours to handle

  const from = msg.key.remoteJid;
  const group = isGroupJid(from);
  const addressed = mentionsBot(msg, sock);

  if (group && !addressed) return;
  if (!group && !config.aiAutoReply && !addressed) return;

  // Respect bot mode: a "private" bot shouldn't chat with strangers either.
  const sender = msg.key.participant || from;
  const senderIsOwner = isOwner(sender, config.ownerNumbers);
  if (config.botMode === 'private' && !senderIsOwner) return;
  if (config.botMode === 'self') return;

  const id = msg.key.id;
  if (answered.has(id)) return;
  answered.set(id, true);

  logger.info({ from, group, addressed }, 'Answering a message with AI auto-reply.');

  // Strip the @mention itself so the model doesn't see a bare phone number
  // in the middle of the question.
  const botNumber = sock.user?.id?.split(':')[0]?.split('@')[0] || '';
  const cleaned = text.replace(new RegExp(`@${botNumber}`, 'g'), '').trim();

  await runAiPrompt(
    {
      sock,
      msg,
      from,
      sender,
      isGroup: group,
      isOwner: senderIsOwner,
      args: [],
      text: cleaned,
      config,
      commands,
      reply: async (content) => {
        const payload = typeof content === 'string' ? { text: content } : content;
        try {
          await sock.sendMessage(from, payload, { quoted: msg });
        } catch (err) {
          logger.error({ err, from }, 'Failed to send an AI auto-reply.');
        }
      },
    },
    { argText: cleaned }
  );
}

module.exports = { registerAiChatHandler };
