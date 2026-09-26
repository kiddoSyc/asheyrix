'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('../../config');
const logger = require('../../utils/logger');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png']);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB — keep menu sends fast

// Visual identity per category — icon shown in the header, used purely for
// readability on a small screen (WhatsApp text formatting is limited to
// bold/italic/strikethrough/mono, so this is most of what we get to work with).
const CATEGORY_META = {
  owner: { icon: '👑', label: 'OWNER' },
  privacy: { icon: '🔒', label: 'PRIVACY' },
  downloader: { icon: '📥', label: 'DOWNLOADER' },
  media: { icon: '🎬', label: 'MEDIA' },
  ai: { icon: '🤖', label: 'AI' },
  pdf: { icon: '📄', label: 'PDF & DOCS' },
  imageai: { icon: '🎨', label: 'AI IMAGE' },
  group: { icon: '👥', label: 'GROUP' },
  tools: { icon: '🛠️', label: 'TOOLS' },
  fun: { icon: '🎉', label: 'FUN' },
};

function metaFor(category) {
  return CATEGORY_META[category] || { icon: '📦', label: category.toUpperCase() };
}

function resolveMenuImage() {
  if (!config.menuImage) return null;

  const fullPath = path.resolve(process.cwd(), config.menuImage);

  if (!fs.existsSync(fullPath)) {
    logger.warn({ path: fullPath }, 'MENU_IMAGE is set but the file does not exist — sending text-only menu.');
    return null;
  }

  const ext = path.extname(fullPath).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    logger.warn({ path: fullPath, ext }, 'MENU_IMAGE has an unsupported extension — sending text-only menu.');
    return null;
  }

  const { size } = fs.statSync(fullPath);
  if (size > MAX_IMAGE_BYTES) {
    logger.warn(
      { path: fullPath, size, max: MAX_IMAGE_BYTES },
      'MENU_IMAGE exceeds the size limit — sending text-only menu.'
    );
    return null;
  }

  return fullPath;
}

function buildMenuText(commands, isOwner) {
  const seen = new Set();
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const lines = [];
  lines.push('╭─────────────────╮');
  lines.push(`   *${config.botName.toUpperCase()}*`);
  lines.push('╰─────────────────╯');
  lines.push('');
  lines.push(`👋 Hi! Here's everything I can do.`);
  lines.push(`Prefix: \`${config.prefix}\`   •   ${time}`);
  lines.push('');

  const categories = [...commands.byCategory.keys()].sort();

  for (const category of categories) {
    const cmdsInCategory = commands.byCategory
      .get(category)
      .filter((cmd) => {
        if (seen.has(cmd.name)) return false;
        seen.add(cmd.name);
        return true;
      })
      .filter((cmd) => !cmd.ownerOnly || isOwner)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (cmdsInCategory.length === 0) continue;

    const { icon, label } = metaFor(category);
    lines.push(`┏━ ${icon} *${label}* ${'━'.repeat(Math.max(1, 14 - label.length))}`);
    for (const cmd of cmdsInCategory) {
      lines.push(`┃ ▸ *${config.prefix}${cmd.name}*`);
    }
    lines.push('┗━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  lines.push(`📊 ${commands.all.length} commands loaded`);
  lines.push(`_Type a command to get started._`);

  return lines.join('\n');
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'm'],
  description: 'Shows all available commands, grouped by category.',
  category: 'tools',
  usage: 'menu',
  cooldown: 5,
  ownerOnly: false,
  groupOnly: false,
  async handler({ sock, from, msg, isOwner, commands }) {
    const caption = buildMenuText(commands, isOwner);
    const imagePath = resolveMenuImage();

    try {
      if (imagePath) {
        await sock.sendMessage(from, { image: fs.readFileSync(imagePath), caption }, { quoted: msg });
        return;
      }
    } catch (err) {
      logger.error({ err, imagePath }, 'Failed to send menu image — falling back to text.');
    }

    await sock.sendMessage(from, { text: caption }, { quoted: msg });
  },
};
