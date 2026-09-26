'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const WARNINGS_PATH = path.resolve(process.cwd(), 'database', 'warnings.json');
const MAX_WARNINGS_BEFORE_KICK = 3; // reference threshold shown to admins; kicking is manual, not automatic

function load() {
  try {
    if (!fs.existsSync(WARNINGS_PATH)) return {};
    return JSON.parse(fs.readFileSync(WARNINGS_PATH, 'utf8'));
  } catch (err) {
    logger.error({ err }, 'Failed to read database/warnings.json — starting fresh.');
    return {};
  }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(WARNINGS_PATH), { recursive: true });
    fs.writeFileSync(WARNINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    logger.error({ err }, 'Failed to write database/warnings.json.');
    return false;
  }
}

function key(groupJid, participantJid) {
  return `${groupJid}::${participantJid}`;
}

function addWarning(groupJid, participantJid, reason) {
  const data = load();
  const k = key(groupJid, participantJid);
  if (!data[k]) data[k] = [];
  data[k].push({ reason: reason || 'No reason given', at: Date.now() });
  save(data);
  return data[k].length;
}

function getWarnings(groupJid, participantJid) {
  const data = load();
  return data[key(groupJid, participantJid)] || [];
}

function clearWarnings(groupJid, participantJid) {
  const data = load();
  delete data[key(groupJid, participantJid)];
  save(data);
}

module.exports = { addWarning, getWarnings, clearWarnings, MAX_WARNINGS_BEFORE_KICK };
