'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const SETTINGS_PATH = path.resolve(process.cwd(), 'database', 'settings.json');

// Keys that are safe to change at runtime, with a parser and validator each.
// Anything NOT listed here can never be touched via .config, no matter what
// is sent — things like OWNER_NUMBERS, AUTH_DIR, and LOG_LEVEL stay
// .env-only by design, since getting those wrong at runtime could lock the
// owner out or corrupt the session.
const SETTABLE_KEYS = {
  prefix: {
    parse: (v) => v,
    validate: (v) => typeof v === 'string' && v.length > 0 && v.length <= 5,
    hint: 'a short string, e.g. "." or "!"',
  },
  botMode: {
    parse: (v) => String(v).toLowerCase(),
    validate: (v) => ['public', 'private', 'self'].includes(v),
    hint: 'one of: public, private, self',
  },
  sendConnectNotification: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  menuImage: {
    parse: (v) => (v === '-' || v.toLowerCase() === 'none' ? '' : v),
    validate: () => true,
    hint: 'a relative file path, or "none" to clear it',
  },

  // --- Phase 3: privacy / status ---
  antiViewOnce: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  antiDelete: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  statusView: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  statusAutoSave: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  statusReact: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  statusReactEmoji: {
    parse: (v) => v,
    validate: (v) => typeof v === 'string' && v.length > 0 && v.length <= 8,
    hint: 'a single emoji, e.g. ❤️',
  },

  // --- Phase 4: downloaders ---
  maxDownloadMB: {
    parse: (v) => Number(v),
    validate: (v) => Number.isFinite(v) && v > 0 && v <= 500,
    hint: 'a number between 1 and 500 (megabytes)',
  },

  // --- Phase 7: AI ---
  // aiApiKey is intentionally absent and must stay that way. Adding it here
  // would let `.config` print it into a chat and write it to
  // database/settings.json, which is not in .gitignore's secret list the way
  // .env is. Keys stay in the environment.
  aiEnabled: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  aiAutoReply: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  aiProvider: {
    parse: (v) => String(v).toLowerCase(),
    validate: (v) =>
      ['anthropic', 'openai', 'groq', 'openrouter', 'deepseek', 'gemini', 'custom'].includes(v),
    hint: 'one of: anthropic, openai, groq, openrouter, deepseek, gemini, custom',
  },
  aiModel: {
    parse: (v) => String(v).trim(),
    validate: (v) => v.length <= 100,
    hint: 'a model id, e.g. claude-sonnet-4-6',
  },
  aiSystemPrompt: {
    parse: (v) => String(v).trim(),
    validate: (v) => v.length > 0 && v.length <= 2000,
    hint: 'instructions, up to 2000 characters',
  },
  aiMaxHistory: {
    parse: (v) => Number(v),
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 30,
    hint: 'a whole number of conversation turns, 0 to 30',
  },
  aiMaxTokens: {
    parse: (v) => Number(v),
    validate: (v) => Number.isInteger(v) && v >= 64 && v <= 8192,
    hint: 'a whole number between 64 and 8192',
  },
  aiTemperature: {
    parse: (v) => Number(v),
    validate: (v) => Number.isFinite(v) && v >= 0 && v <= 2,
    hint: 'a number between 0 and 2',
  },

  // --- View Once manual triggers ---
  viewOnceTriggerWord: {
    parse: (v) => String(v).trim().toLowerCase(),
    validate: (v) => /^[a-z0-9]{2,20}$/.test(v),
    hint: '2-20 letters or digits, no spaces',
  },
  viewOnceTriggerEmoji: {
    parse: (v) => String(v).trim(),
    validate: (v) => v.length > 0 && v.length <= 8,
    hint: 'a single emoji',
  },

  // --- Phase 9: music ---
  'music.enabled': {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  'music.defaultQuality': {
    parse: (v) => String(v).toLowerCase().trim(),
    validate: (v) => ['low', 'medium', 'high'].includes(v),
    hint: 'one of: low, medium, high',
  },
  'music.maxFileSize': {
    parse: (v) => Number(v),
    validate: (v) => Number.isFinite(v) && v > 0 && v <= 100,
    hint: 'a number between 1 and 100 (megabytes)',
  },
  'music.maxDuration': {
    parse: (v) => Number(v),
    validate: (v) => Number.isFinite(v) && v >= 30 && v <= 7200,
    hint: 'a number of seconds between 30 and 7200',
  },
  'music.maxConcurrentDownloads': {
    parse: (v) => Number(v),
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 5,
    hint: 'a whole number between 1 and 5',
  },
  'music.autoLinkDetection': {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },

  // --- Phase 6: group management ---
  antiLink: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  welcomeEnabled: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  goodbyeEnabled: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
  groupAdminOnly: {
    parse: (v) => ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase()),
    validate: () => true,
    hint: 'true or false',
  },
};

function loadPersistedSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error(
      { err },
      'Failed to read database/settings.json — starting with .env defaults only.'
    );
    return {};
  }
}

function savePersistedSettings(data) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    logger.error({ err }, 'Failed to write database/settings.json.');
    return false;
  }
}

/**
 * Applies any previously-saved overrides on top of the .env-derived config
 * object, in place. Every module already holding a reference to `config`
 * sees the change immediately — no re-require, no restart.
 */
function applyPersistedSettings(config) {
  const persisted = loadPersistedSettings();
  let appliedCount = 0;

  for (const [key, value] of Object.entries(persisted)) {
    if (SETTABLE_KEYS[key]) {
      config[key] = value;
      appliedCount += 1;
    }
  }

  if (appliedCount > 0) {
    logger.info({ appliedCount }, 'Applied saved settings from database/settings.json.');
  }

  return config;
}

/**
 * Validates and applies a single setting change: mutates the live config
 * object AND persists it to disk. Throws a plain Error with a
 * user-presentable message on any failure — callers can catch and reply
 * with err.message directly.
 */
function updateSetting(config, key, rawValue) {
  const def = SETTABLE_KEYS[key];
  if (!def) {
    throw new Error(
      `Unknown or protected setting "${key}". Configurable: ${Object.keys(SETTABLE_KEYS).join(', ')}`
    );
  }

  const parsed = def.parse(rawValue);
  if (!def.validate(parsed)) {
    throw new Error(`Invalid value for "${key}". Expected ${def.hint}.`);
  }

  const persisted = loadPersistedSettings();
  persisted[key] = parsed;
  const saved = savePersistedSettings(persisted);

  if (!saved) {
    throw new Error(
      'Could not save that setting to disk, so it was not applied. Check the logs for details.'
    );
  }

  // Only mutate the live config after a successful save, so an in-memory
  // change never outruns what's actually on disk.
  config[key] = parsed;
  return parsed;
}

function listSettableKeys() {
  return Object.keys(SETTABLE_KEYS);
}

module.exports = {
  applyPersistedSettings,
  updateSetting,
  listSettableKeys,
  SETTINGS_PATH,
};
