'use strict';

require('dotenv').config();

/**
 * Splits a comma-separated env var into a clean array of strings.
 */
function parseList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

const config = {
  botName: process.env.BOT_NAME || 'WA-Bot',
  prefix: process.env.PREFIX || '.',

  // Owners are stored as bare digit strings (no @s.whatsapp.net suffix, no +)
  ownerNumbers: parseList(process.env.OWNER_NUMBERS),

  // 'public' | 'private' | 'self'
  botMode: (process.env.BOT_MODE || 'private').toLowerCase(),

  // 'qr' | 'pairing'
  loginMethod: (process.env.LOGIN_METHOD || 'qr').toLowerCase(),
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/\D/g, ''),

  authDir: process.env.AUTH_DIR || './auth',

  logLevel: process.env.LOG_LEVEL || 'info',
  prettyLogs: parseBool(process.env.PRETTY_LOGS, true),

  // Sends a "bot connected" message to the owner(s) whenever a WhatsApp
  // connection is established (initial login and every reconnect).
  sendConnectNotification: parseBool(process.env.SEND_CONNECT_NOTIFICATION, true),

  // Optional local image file shown alongside .menu. Leave blank to send
  // text-only. Path is resolved relative to the project root.
  menuImage: process.env.MENU_IMAGE || '',

  // --- Phase 3: privacy / status (all overridable at runtime via commands,
  // persisted through settingsStore — these are just the first-run defaults) ---
  antiViewOnce: false,
  antiDelete: false,
  statusView: false,
  statusAutoSave: false,
  statusReact: false,
  statusReactEmoji: '❤️',

  // --- View Once manual triggers (prefix-less, owner-only, DM delivery) ---
  // Reply this exact word to a View Once message to unlock it.
  viewOnceTriggerWord: process.env.VIEW_ONCE_TRIGGER_WORD || 'waw',
  // React with this exact emoji to unlock it (best-effort — see
  // handlers/viewOnceTriggerHandler.js for why the reply is more reliable).
  viewOnceTriggerEmoji: process.env.VIEW_ONCE_TRIGGER_EMOJI || '👀',

  // --- Phase 4: downloaders ---
  maxDownloadMB: Number(process.env.MAX_DOWNLOAD_MB) || 50,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',

  // --- Phase 7: AI ---
  // The API key is read from the environment and deliberately kept OUT of
  // settingsStore's settable keys, so no runtime command can ever print it
  // or write it to database/settings.json.
  aiApiKey: process.env.AI_API_KEY || '',
  aiProvider: (process.env.AI_PROVIDER || 'anthropic').toLowerCase(),
  aiModel: process.env.AI_MODEL || '',
  aiBaseUrl: process.env.AI_BASE_URL || '',

  aiEnabled: parseBool(process.env.AI_ENABLED, false),
  aiAutoReply: false, // prefix-less replies in DMs; runtime-toggleable
  aiMaxTokens: Number(process.env.AI_MAX_TOKENS) || 1024,
  aiTemperature: Number(process.env.AI_TEMPERATURE) || 0.7,
  aiMaxHistory: Number(process.env.AI_MAX_HISTORY) || 6, // conversation turns
  aiTimeoutSeconds: Number(process.env.AI_TIMEOUT_SECONDS) || 60,
  aiMaxImageMB: Number(process.env.AI_MAX_IMAGE_MB) || 5,
  aiDefaultTranslateLanguage: process.env.AI_DEFAULT_TRANSLATE_LANGUAGE || 'English',

  aiDefaultSystemPrompt:
    'You are a helpful assistant replying inside WhatsApp. Keep answers short and ' +
    'conversational — a few sentences unless more is genuinely needed. Use WhatsApp ' +
    'formatting (*bold*, _italic_) sparingly. Never invent facts; say when you are unsure.',
  get aiSystemPrompt() {
    return this._aiSystemPrompt || this.aiDefaultSystemPrompt;
  },
  set aiSystemPrompt(value) {
    this._aiSystemPrompt = value;
  },

  // --- PDF / document tools ---
  // Ceiling on how much of a PDF is read. Beyond this, extraction stops and
  // the user is told the answer covers only part of the document — better
  // than silently basing a summary on page 1 of 400.
  pdfMaxPages: Number(process.env.PDF_MAX_PAGES) || 100,
  // OCR is far slower than text extraction (a render plus a Tesseract pass
  // per page), so scanned PDFs get a much lower page ceiling.
  pdfOcrMaxPages: Number(process.env.PDF_OCR_MAX_PAGES) || 10,
  // Characters of PDF text sent to the model in one request. Roughly
  // 12k characters ≈ 3k tokens, which fits every provider's context window
  // alongside the instruction and the answer.
  pdfMaxCharsForAi: Number(process.env.PDF_MAX_CHARS_FOR_AI) || 12000,
  // 'low' | 'medium' | 'high' — how hard .compresspdf squeezes by default.
  pdfCompressQuality: (process.env.PDF_COMPRESS_QUALITY || 'medium').toLowerCase(),
  // Most single PDFs .splitpdf will send back before asking for a range
  // instead, so nobody accidentally gets 200 documents in their chat.
  pdfMaxSplitOutputs: Number(process.env.PDF_MAX_SPLIT_OUTPUTS) || 10,

  // --- AI image generation ---
  // Defaults to the keyless provider so the image commands work on a fresh
  // install without any account setup. Owners who want higher quality set
  // IMAGE_PROVIDER + IMAGE_API_KEY.
  imageProvider: (process.env.IMAGE_PROVIDER || 'pollinations').toLowerCase(),
  // Read from the environment only, and deliberately kept OUT of
  // settingsStore's settable keys, so no runtime command can print it or
  // write it to database/settings.json. Same rule as aiApiKey.
  imageApiKey: process.env.IMAGE_API_KEY || '',
  imageModel: process.env.IMAGE_MODEL || '',
  imageBaseUrl: process.env.IMAGE_BASE_URL || '',
  imageTimeoutSeconds: Number(process.env.IMAGE_TIMEOUT_SECONDS) || 120,
  imageMaxMB: Number(process.env.IMAGE_MAX_MB) || 10,
  // Optional dedicated background-removal key; when set, .removebg prefers
  // it over prompting a general image model.
  removeBgApiKey: process.env.REMOVEBG_API_KEY || '',

  // --- Phase 9: music ---
  // Flat dotted keys so `.config music.enabled true` works with the existing
  // settingsStore, which stores one level of key/value pairs.
  'music.enabled': parseBool(process.env.MUSIC_ENABLED, true),
  'music.defaultQuality': (process.env.MUSIC_DEFAULT_QUALITY || 'medium').toLowerCase(),
  'music.maxFileSize': Number(process.env.MUSIC_MAX_FILE_SIZE_MB) || 50, // MB
  'music.maxDuration': Number(process.env.MUSIC_MAX_DURATION) || 600, // seconds
  'music.maxConcurrentDownloads': Number(process.env.MUSIC_MAX_CONCURRENT) || 2,
  'music.autoLinkDetection': parseBool(process.env.MUSIC_AUTO_LINK_DETECTION, false),

  // --- Phase 6: group management ---
  antiLink: false,
  welcomeEnabled: false,
  goodbyeEnabled: false,
  groupAdminOnly: false,
};

// Basic sanity checks that fail loudly at startup instead of silently
// misbehaving later.
function validateConfig(cfg) {
  const problems = [];

  if (!['public', 'private', 'self'].includes(cfg.botMode)) {
    problems.push(
      `BOT_MODE must be one of: public, private, self (got "${cfg.botMode}")`
    );
  }

  if (!['qr', 'pairing'].includes(cfg.loginMethod)) {
    problems.push(
      `LOGIN_METHOD must be one of: qr, pairing (got "${cfg.loginMethod}")`
    );
  }

  if (cfg.loginMethod === 'pairing' && !cfg.pairingNumber) {
    problems.push('LOGIN_METHOD=pairing requires PAIRING_NUMBER to be set.');
  }

  if (cfg.ownerNumbers.length === 0) {
    problems.push(
      'OWNER_NUMBERS is empty — owner-only features will not work for anyone. Set it in .env.'
    );
  }

  return problems;
}

module.exports = { config, validateConfig, parseList, parseBool };
