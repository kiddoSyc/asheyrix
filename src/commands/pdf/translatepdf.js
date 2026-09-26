'use strict';

const { config } = require('../../config');
const { resolvePdfText } = require('../../lib/pdfCommandHelper');
const { capTextForModel } = require('../../services/pdf');
const { ask } = require('../../services/ai');
const { AiError } = require('../../services/ai/errors');
const { chunkText } = require('../../lib/aiCommandHelper');
const logger = require('../../utils/logger');

module.exports = {
  name: 'translatepdf',
  aliases: ['pdftranslate'],
  description: 'Translates the text of a replied or attached PDF.',
  category: 'pdf',
  usage: 'translatepdf <language> (reply to a PDF)',
  cooldown: 12,
  async handler(ctx) {
    const { reply, text: argText } = ctx;

    const language = argText.trim() || config.aiDefaultTranslateLanguage;

    const doc = await resolvePdfText(ctx, {
      usageHint: `Reply to a PDF with *${config.prefix}translatepdf <language>*.`,
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
              `Translate the document below into ${language}.\n` +
              'Preserve the structure — keep headings as headings and lists as lists.\n' +
              'Output only the translation, with no preamble and no commentary.\n' +
              'Leave proper nouns, code, and numbers as they are.\n\n' +
              `--- ${doc.fileName} ---\n${text}`,
          },
        ],
        systemPrompt: `You are a careful translator. You translate into ${language} and output nothing else.`,
      });
    } catch (err) {
      if (err instanceof AiError) {
        await reply(`🤖 ${err.message}`);
      } else {
        logger.error({ err }, 'translatepdf failed.');
        await reply('❌ Could not translate that PDF. The error has been logged.');
      }
      return;
    }

    const header = `🌍 *${doc.fileName} → ${language}*`;
    const notice =
      doc.truncated || truncated
        ? '\n\n_⚠️ The document was long, so only its first part was translated._'
        : '';

    for (const chunk of chunkText(`${header}\n\n${answer}${notice}`)) {
      await reply(chunk);
    }
  },
};
