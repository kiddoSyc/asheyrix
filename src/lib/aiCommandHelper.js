'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');
const { ask, aiStatus } = require('../services/ai');
const { getHistory, remember } = require('../services/ai/conversation');
const { getTargetMedia } = require('./getTargetMedia');
const { getQuotedInfo } = require('../utils/quoted');
const { extractText } = require('../utils/messageContent');
const { AiError } = require('../services/ai/errors');

/**
 * The glue between "someone sent a WhatsApp message" and "send a prompt to
 * a model". Every AI command goes through `runAiPrompt` so that history,
 * image attachment, length limits, and error phrasing behave identically
 * across .ai, .translate, .summarize and the auto-reply handler.
 */

// WhatsApp silently truncates very long messages on some clients, so long
// replies are split at paragraph boundaries rather than mid-word.
const MAX_CHUNK = 3500;

function chunkText(text) {
  if (text.length <= MAX_CHUNK) return [text];

  const chunks = [];
  let current = '';

  for (const paragraph of text.split('\n')) {
    if ((current + '\n' + paragraph).length > MAX_CHUNK && current) {
      chunks.push(current.trim());
      current = '';
    }
    // A single paragraph longer than the limit still has to be cut somewhere.
    if (paragraph.length > MAX_CHUNK) {
      for (let i = 0; i < paragraph.length; i += MAX_CHUNK) {
        chunks.push(paragraph.slice(i, i + MAX_CHUNK));
      }
      continue;
    }
    current += (current ? '\n' : '') + paragraph;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Pulls an image off the message (attached or replied-to) for vision models.
 * Returns null when there's no image or the provider can't use one — never
 * throws, since an unreadable image shouldn't sink a text prompt.
 */
async function collectImage(sock, msg) {
  try {
    const media = await getTargetMedia(sock, msg);
    if (!media) return null;
    if (media.type !== 'imageMessage' && media.type !== 'stickerMessage') return null;

    const maxBytes = config.aiMaxImageMB * 1024 * 1024;
    if (media.buffer.length > maxBytes) {
      logger.info(
        { bytes: media.buffer.length },
        'Skipped attaching an image to an AI prompt — over the size limit.'
      );
      return null;
    }

    return {
      mimetype: media.mimetype || 'image/jpeg',
      base64: media.buffer.toString('base64'),
    };
  } catch (err) {
    logger.warn({ err }, 'Could not attach image to AI prompt — continuing with text only.');
    return null;
  }
}

/**
 * Builds the prompt text from the command arguments plus, if the user
 * replied to something, the text of that message. Replying to a message
 * with just ".ai" and no arguments is a common and useful shape.
 */
function buildPromptText({ argText, msg }) {
  const quoted = getQuotedInfo(msg);
  const quotedText = quoted ? extractText(quoted.message).trim() : '';

  if (argText && quotedText) {
    return `${argText}\n\n--- quoted message ---\n${quotedText}`;
  }
  return argText || quotedText || '';
}

/**
 * @param {object}  ctx                  the command context
 * @param {object}  options
 * @param {string}  [options.argText]    defaults to ctx.text
 * @param {string}  [options.instruction] prepended task framing (translate/summarize)
 * @param {string}  [options.systemPrompt] overrides the configured persona
 * @param {boolean} [options.useHistory] default true
 * @param {string}  [options.emptyHint]  shown when there's nothing to send
 */
async function runAiPrompt(ctx, options = {}) {
  const { sock, msg, from, sender, reply } = ctx;
  const {
    argText = ctx.text,
    instruction,
    systemPrompt,
    useHistory = true,
    emptyHint = `Ask me something: ${config.prefix}ai <your question>`,
  } = options;

  const status = aiStatus();
  if (!status.ready) {
    await reply(`🤖 ${status.reason}`);
    return null;
  }

  const image = await collectImage(sock, msg);
  const body = buildPromptText({ argText: (argText || '').trim(), msg });

  if (!body && !image) {
    await reply(emptyHint);
    return null;
  }

  const userText = instruction ? `${instruction}\n\n${body}`.trim() : body;

  const messages = [
    ...(useHistory ? getHistory(from, sender) : []),
    { role: 'user', text: userText || 'Describe this image.', images: image ? [image] : [] },
  ];

  // A visible "typing" state is the only feedback available while a slow
  // model thinks — without it the bot looks frozen for several seconds.
  try {
    await sock.sendPresenceUpdate('composing', from);
  } catch {
    // Presence is cosmetic; never let it block the actual reply.
  }

  let answer;
  try {
    answer = await ask({ messages, systemPrompt });
  } catch (err) {
    if (err instanceof AiError) {
      await reply(`🤖 ${err.message}`);
    } else {
      logger.error({ err }, 'Unexpected failure in an AI command.');
      await reply('🤖 Something went wrong talking to the AI. It has been logged.');
    }
    return null;
  } finally {
    try {
      await sock.sendPresenceUpdate('paused', from);
    } catch {
      /* cosmetic */
    }
  }

  if (useHistory) {
    remember(from, sender, { userText, assistantText: answer });
  }

  for (const chunk of chunkText(answer)) {
    await reply(chunk);
  }

  return answer;
}

module.exports = { runAiPrompt, chunkText };
