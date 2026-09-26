'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STORE_PATH = path.resolve(process.cwd(), 'database', 'music.json');

const MAX_HISTORY = 15;
const MAX_FAVORITES = 30;

// Shape: { history: { [userJid]: [{title, url, at}] },
//          favorites: { [userJid]: [{title, url}] },
//          quality: { [userJid]: 'low'|'medium'|'high' } }
let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = fs.existsSync(STORE_PATH)
      ? JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
      : {};
  } catch (err) {
    logger.error({ err }, 'Could not read database/music.json — starting empty.');
    cache = {};
  }
  cache.history = cache.history || {};
  cache.favorites = cache.favorites || {};
  cache.quality = cache.quality || {};
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(load(), null, 2), 'utf8');
  } catch (err) {
    // A failed write costs the user their history, not their download.
    logger.error({ err }, 'Could not write database/music.json.');
  }
}

function addHistory(userJid, { title, url }) {
  const data = load();
  const list = data.history[userJid] || [];
  list.unshift({ title, url, at: Date.now() });
  data.history[userJid] = list.slice(0, MAX_HISTORY);
  save();
}

function getHistory(userJid) {
  return load().history[userJid] || [];
}

function clearHistory(userJid) {
  const data = load();
  delete data.history[userJid];
  save();
}

function addFavorite(userJid, { title, url }) {
  const data = load();
  const list = data.favorites[userJid] || [];
  if (list.some((f) => f.url === url)) return { added: false, reason: 'already saved' };
  if (list.length >= MAX_FAVORITES) return { added: false, reason: `list is full (${MAX_FAVORITES})` };
  list.push({ title, url });
  data.favorites[userJid] = list;
  save();
  return { added: true };
}

function getFavorites(userJid) {
  return load().favorites[userJid] || [];
}

function removeFavorite(userJid, index) {
  const data = load();
  const list = data.favorites[userJid] || [];
  if (index < 0 || index >= list.length) return null;
  const [removed] = list.splice(index, 1);
  data.favorites[userJid] = list;
  save();
  return removed;
}

function setQuality(userJid, quality) {
  const data = load();
  data.quality[userJid] = quality;
  save();
}

function getQuality(userJid) {
  return load().quality[userJid] || null;
}

module.exports = {
  addHistory,
  getHistory,
  clearHistory,
  addFavorite,
  getFavorites,
  removeFavorite,
  setQuality,
  getQuality,
  STORE_PATH,
};
