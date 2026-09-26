'use strict';

const { config } = require('../../config');
const { resolvePdfText } = require('../../lib/pdfCommandHelper');
const { capTextForModel } = require('../../services/pdf');
const { ask } = require('../../services/ai');
const { AiError } = require('../../services/ai/errors');
const { chunkText } = require('../../lib/aiCommandHelper');
const logger = require('../../utils/logger');

module.exports = {
  name: 'askpdf',
  aliases: ['pdfask', 'pdfq'],
  description: 'Asks a question about a replied or attached PDF.',
  category: 'pdf',
  usage: 'askpdf <question> (reply to a PDF)',
  cooldown: 10,
  async handler(ctx) {
    const { reply, text: question } = ctx;

    if (!question.trim()) {
      await reply(
        `Ask something about the PDF: *${config.prefix}askpdf what is the deadline?*\n\n` +
          'Reply to the PDF the first time — after that I remember it for 30 minutes.'
      );
      return;
    }

    // allowCache means follow-up questions work without re-replying to the
    // document every time, which is the whole point of a Q&A command.
    const doc = await resolvePdfText(ctx, {
      usageHint: `Reply to a PDF with *${config.prefix}askpdf <question>*.`,
      allowCache: true,
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
              'Answer the question using only the document below.\n' +
              'If the document does not contain the answer, say so plainly instead of guessing.\n' +
              'Quote short phrases from it where that makes the answer clearer.\n\n' +
              `--- ${doc.fileName} ---\n${text}\n--- end of document ---\n\n` +
              `Question: ${question.trim()}`,
          },
        ],
        systemPrompt:
          'You answer questions about documents for a WhatsApp reader. Be accurate and ' +
          'concise. Never invent details that are not in the document.',
      });
    } catch (err) {
      if (err instanceof AiError) {
        await reply(`🤖 ${err.message}`);
      } else {
        logger.error({ err }, 'askpdf failed.');
        await reply('❌ Could not answer that. The error has been logged.');
      }
      return;
    }

    const source = doc.fromCache ? `_(from ${doc.fileName}, still remembered)_\n\n` : '';
    const notice =
      doc.truncated || truncated
        ? '\n\n_⚠️ The document was long, so only its first part was searched._'
        : '';

    for (const chunk of chunkText(`${source}${answer}${notice}`)) {
      await reply(chunk);
    }
  },
};
