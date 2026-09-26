'use strict';

const { config } = require('../../config');
const { runAiPrompt } = require('../../lib/aiCommandHelper');

/**
 * Single-shot AI commands. They share one shape: take whatever the user
 * replied to (or typed), wrap it in a task instruction, and answer without
 * touching conversation history — these are one-off transformations, and
 * letting them pollute the .ai thread would make later replies confusing.
 *
 * commandLoader accepts an array export, so all of these live in one file
 * rather than five near-identical ones.
 */

function buildTaskCommand({ name, aliases, description, usage, instruction, systemPrompt, cooldown = 6 }) {
  return {
    name,
    aliases,
    description,
    category: 'ai',
    usage,
    ownerOnly: false,
    groupOnly: false,
    cooldown,
    async handler(ctx) {
      await runAiPrompt(ctx, {
        instruction: typeof instruction === 'function' ? instruction(ctx) : instruction,
        systemPrompt,
        useHistory: false,
        emptyHint: `Reply to a message with *${config.prefix}${name}*, or type the text after it.`,
      });
    },
  };
}

module.exports = [
  buildTaskCommand({
    name: 'translate',
    aliases: ['tr'],
    description: 'Translates text into another language. Reply to a message or type it out.',
    usage: 'translate <language> <text>  •  reply with .translate <language>',
    instruction: (ctx) => {
      // The first argument is the target language when one is given;
      // otherwise fall back to a sensible default rather than erroring.
      const target = ctx.args[0] || config.aiDefaultTranslateLanguage;
      return (
        `Translate the following into ${target}. ` +
        `Reply with only the translation — no preamble, no explanation, no romanisation ` +
        `unless the target script is non-Latin, in which case add it on a second line.`
      );
    },
    systemPrompt: 'You are a precise translator. You output translations and nothing else.',
  }),

  buildTaskCommand({
    name: 'summarize',
    aliases: ['sum', 'tldr'],
    description: 'Summarizes a long message into a few bullet points.',
    usage: 'summarize <text>  •  reply to a long message with .summarize',
    instruction:
      'Summarize the following in at most five short bullet points. ' +
      'Keep names, numbers, and dates exact. No preamble.',
  }),

  buildTaskCommand({
    name: 'explain',
    aliases: ['eli5'],
    description: 'Explains something in plain language, as if to a beginner.',
    usage: 'explain <topic>  •  reply to a message with .explain',
    instruction:
      'Explain the following in plain language a beginner could follow. ' +
      'Use a short everyday comparison if it helps. Keep it under 150 words.',
  }),

  buildTaskCommand({
    name: 'grammar',
    aliases: ['fixgrammar', 'proofread'],
    description: 'Fixes spelling and grammar without changing your voice.',
    usage: 'grammar <text>  •  reply to a message with .grammar',
    instruction:
      'Correct the spelling, grammar, and punctuation of the following. ' +
      'Keep the original tone and word choices wherever they are already correct. ' +
      'Reply with only the corrected text.',
  }),

  buildTaskCommand({
    name: 'rewrite',
    aliases: ['reword'],
    description: 'Rewrites a message in a different tone (formal, casual, short...).',
    usage: 'rewrite <tone> <text>  •  reply with .rewrite formal',
    instruction: (ctx) => {
      const tone = ctx.args[0] || 'clearer and more natural';
      return `Rewrite the following to be ${tone}. Keep the meaning identical. Reply with only the rewritten text.`;
    },
  }),
];
