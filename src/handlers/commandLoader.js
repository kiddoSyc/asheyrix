'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const REQUIRED_FIELDS = ['name', 'handler'];

/**
 * Recursively finds all .js files under a directory.
 */
function findJsFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Validates the shape of a command module before registering it, so a
 * malformed command fails at load time with a clear message instead of
 * crashing mid-conversation later.
 */
function validateCommand(cmd, filePath) {
  for (const field of REQUIRED_FIELDS) {
    if (!cmd[field]) {
      throw new Error(
        `Command in "${filePath}" is missing required field "${field}"`
      );
    }
  }
  if (typeof cmd.handler !== 'function') {
    throw new Error(`Command "${cmd.name}" in "${filePath}" has a non-function handler`);
  }
  if (cmd.aliases && !Array.isArray(cmd.aliases)) {
    throw new Error(`Command "${cmd.name}" aliases must be an array`);
  }
}

/**
 * Loads every command found under `commandsDir`.
 *
 * Directory names become the default category (e.g. commands/tools/ping.js
 * -> category "tools") unless the command explicitly sets its own category.
 *
 * @returns {{
 *   byName: Map<string, object>,
 *   byCategory: Map<string, object[]>,
 *   all: object[]
 * }}
 */
function loadCommands(commandsDir) {
  const byName = new Map();
  const byCategory = new Map();
  const all = [];

  if (!fs.existsSync(commandsDir)) {
    logger.warn({ commandsDir }, 'Commands directory does not exist, skipping.');
    return { byName, byCategory, all };
  }

  const files = findJsFiles(commandsDir);

  for (const file of files) {
    try {
      // Ensure a fresh copy on reload (useful for --watch/dev mode).
      delete require.cache[require.resolve(file)];
      const mod = require(file);

      // Support both `module.exports = {...}` and `module.exports = [ {...}, {...} ]`
      const cmds = Array.isArray(mod) ? mod : [mod];

      for (const cmd of cmds) {
        validateCommand(cmd, file);

        const relativeDir = path.relative(commandsDir, path.dirname(file));
        const category = (cmd.category || relativeDir || 'general').toLowerCase();

        const fullCmd = {
          aliases: [],
          description: 'No description provided.',
          usage: cmd.name,
          category,
          ownerOnly: false,
          groupOnly: false,
          cooldown: 3, // seconds
          ...cmd,
        };

        if (byName.has(fullCmd.name)) {
          logger.warn(
            { command: fullCmd.name, file },
            'Duplicate command name detected, overwriting previous registration.'
          );
        }

        byName.set(fullCmd.name, fullCmd);
        for (const alias of fullCmd.aliases) {
          byName.set(alias, fullCmd);
        }

        if (!byCategory.has(category)) byCategory.set(category, []);
        byCategory.get(category).push(fullCmd);

        all.push(fullCmd);
      }
    } catch (err) {
      logger.error({ err, file }, 'Failed to load command file — skipping it.');
    }
  }

  logger.info({ count: all.length }, 'Commands loaded.');
  return { byName, byCategory, all };
}

module.exports = { loadCommands };
