'use strict';

const { config } = require('../../config');
const { resolvePdfText } = require('../../lib/pdfCommandHelper');
const { capTextForModel } = require('../../services/pdf');
const { ask } = require('../../services/ai');
const { AiError } = require('../../services/ai/errors');
const { chunkText } = require('../../lib/aiCommandHelper');
const logger = require('../../utils/logger');

module.exports = {
  name: 'pdfsummary',
  aliases: ['summarizepdf', 'pdfsum'],
  description: 'Summarizes a replied or attached PDF.',
  category: 'pdf',
  usage: 'pdfsummary (reply to a PDF, or send one with this as the caption)',
  cooldown: 10,
  async handler(ctx) {
    const { reply } = ctx;

    const doc = await resolvePdfText(ctx, {
      usageHint: `Reply to a PDF with *${config.prefix}pdfsummary*, or send a PDF with that as the caption.`,
    });
    if (!doc) return;

    const { text, truncated } = capTextForModel(doc.text, config.pdfMaxCharsForAi);

    let answer;
    try {
      answer = await ask({
        messages: [
          {
            role: 'user',
            text:
              'Summarize the document below for someone who has not read it.\n' +
              'Lead with a one-sentence overview, then the key points as short bullets.\n' +
              'Only use what the document actually says — never fill in gaps.\n\n' +
              `--- ${doc.fileName} ---\n${text}`,
          },
        ],
        // No conversation history: a summary should reflect the document,
        // not whatever the user was chatting about beforehand.
        systemPrompt:
          'You summarize documents accurately and concisely for a WhatsApp reader. ' +
          'Keep it tight and use *bold* sparingly for section labels.',
      });
    } catch (err) {
      if (err instanceof AiError) {
        await reply(`🤖 ${err.message}`);
      } else {
        logger.error({ err }, 'PDF summary failed.');
        await reply('❌ Could not summarize that PDF. The error has been logged.');
      }
      return;
    }

    const header = `📄 *Summary — ${doc.fileName}*\n_${doc.pageCount} page(s)_`;
    const notice =
      doc.truncated || truncated
        ? '\n\n_⚠️ The document was long, so this covers only the first part of it._'
        : '';

    for (const chunk of chunkText(`${header}\n\n${answer}${notice}`)) {
      await reply(chunk);
    }
  },
};
