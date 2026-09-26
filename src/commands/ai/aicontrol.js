'use strict';

const { config } = require('../../config');
const { aiStatus, listProviders } = require('../../services/ai');
const { clearThread, clearAll, activeThreadCount } = require('../../services/ai/conversation');
const { updateSetting } = require('../../database/settingsStore');

/**
 * Control surface for the AI system: wipe context, inspect what's
 * configured, and set the persona.
 *
 * Note what `.aistatus` deliberately does NOT print: the API key, or any
 * prefix of it. Owners run status checks in group chats often enough that
 * even a partial key on screen is a real risk, and "is a key set: yes"
 * answers the actual question.
 */

const clearCommand = {
  name: 'aiclear',
  aliases: ['aireset', 'forget'],
  description: 'Clears your AI conversation history in this chat.',
  category: 'ai',
  usage: 'aiclear [all]',
  ownerOnly: false,
  cooldown: 3,
  async handler({ args, from, sender, isOwner, reply }) {
    if ((args[0] || '').toLowerCase() === 'all') {
      if (!isOwner) {
        await reply('⛔ Only the bot owner can clear every conversation.');
        return;
      }
      const count = clearAll();
      await reply(`🧹 Cleared ${count} conversation thread${count === 1 ? '' : 's'}.`);
      return;
    }

    const had = clearThread(from, sender);
    await reply(had ? '🧹 Forgotten — we start fresh.' : 'Nothing to clear; we had no history here.');
  },
};

const statusCommand = {
  name: 'aistatus',
  aliases: ['aiinfo'],
  description: 'Shows which AI provider and model are configured, and whether they work.',
  category: 'ai',
  usage: 'aistatus',
  ownerOnly: true,
  cooldown: 5,
  async handler({ reply }) {
    const status = aiStatus();

    const lines = ['🤖 *AI status*', ''];
    lines.push(`• Enabled: ${config.aiEnabled ? 'yes' : 'no'}`);
    lines.push(`• Provider: ${config.aiProvider || '(unset)'}`);
    lines.push(`• Model: ${config.aiModel || '(provider default)'}`);
    lines.push(`• API key set: ${config.aiApiKey ? 'yes' : 'no'}`);
    lines.push(`• Auto-reply in DMs: ${config.aiAutoReply ? 'on' : 'off'}`);
    lines.push(`• History window: ${config.aiMaxHistory} turns`);
    lines.push(`• Active threads: ${activeThreadCount()}`);
    lines.push('');

    if (status.ready) {
      lines.push(`✅ Ready — ${status.label}, ${status.model}`);
    } else {
      lines.push(`⚠️ Not ready: ${status.reason}`);
      lines.push('');
      lines.push(`Providers: ${listProviders().join(', ')}`);
    }

    await reply(lines.join('\n'));
  },
};

const personaCommand = {
  name: 'aipersona',
  aliases: ['aiprompt'],
  description: "Sets the AI's system prompt — its personality and instructions.",
  category: 'ai',
  usage: 'aipersona <instructions>  •  aipersona reset',
  ownerOnly: true,
  cooldown: 3,
  async handler({ text, reply }) {
    const input = (text || '').trim();

    if (!input) {
      await reply(
        `🎭 *Current persona*\n\n${config.aiSystemPrompt}\n\n` +
          `Change it: ${config.prefix}aipersona <instructions>\n` +
          `Restore default: ${config.prefix}aipersona reset`
      );
      return;
    }

    try {
      if (input.toLowerCase() === 'reset') {
        const applied = updateSetting(config, 'aiSystemPrompt', config.aiDefaultSystemPrompt);
        await reply(`🎭 Persona reset to default:\n\n${applied}`);
        return;
      }

      const applied = updateSetting(config, 'aiSystemPrompt', input);
      await reply(`🎭 Persona updated:\n\n${applied}`);
    } catch (err) {
      await reply(`⚠️ ${err.message}`);
    }
  },
};

module.exports = [clearCommand, statusCommand, personaCommand];
