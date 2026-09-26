'use strict';

const { config } = require('../config');
const logger = require('../utils/logger');
const { subscribeToMessages } = require('./messageBus');
const { extractText } = require('../utils/messageContent');
const { detectProvider } = require('../services/downloaders');
const { sendDownloadResult } = require('../lib/downloadCommandHelper');
const { DownloaderError } = require('../services/downloaders/errors');
const { enqueue } = require('../services/music/queue');
const { musicSetting } = require('../services/music/settings');

/**
 * Watches for links from supported platforms and downloads them without a
 * command — but only while `music.autoLinkDetection` is on. It defaults to
 * off deliberately: a bot that silently downloads every link posted in a
 * group is a good way to burn bandwidth and annoy people.
 *
 * Downloads go through the same queue as `.play`, so auto-detection can't
 * outrun the concurrency limit.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

// Recently handled URLs, so a link reposted twice in a minute (or a
// WhatsApp retry) doesn't download twice.
const recent = new Map(); // url -> timestamp
const RECENT_WINDOW_MS = 2 * 60 * 1000;

function seenRecently(url) {
  const at = recent.get(url);
  if (at && Date.now() - at < RECENT_WINDOW_MS) return true;

  recent.set(url, Date.now());
  if (recent.size > 200) {
    for (const [key, ts] of recent) {
      if (Date.now() - ts > RECENT_WINDOW_MS) recent.delete(key);
    }
  }
  return false;
}

function registerLinkDetectionHandler(sock) {
  subscribeToMessages(({ messages, type }) => {
    if (type !== 'notify') return;
    if (!musicSetting('autoLinkDetection')) return;

    for (const msg of messages) {
      handleMessage(sock, msg).catch((err) => {
        logger.error({ err }, 'Link auto-detection failed.');
      });
    }
  }, { name: 'link-detect' });
}

async function handleMessage(sock, msg) {
  if (!msg.message) return;
  if (msg.key.fromMe) return; // don't react to the bot's own sends
  if (msg.key.remoteJid === 'status@broadcast') return;

  const text = extractText(msg.message).trim();
  if (!text || text.startsWith(config.prefix)) return; // commands handle themselves

  const matches = text.match(URL_PATTERN);
  if (!matches) return;

  // One link per message is plenty — a wall of links shouldn't become a
  // wall of downloads.
  const url = matches.find((candidate) => detectProvider(candidate));
  if (!url) return;

  const detected = detectProvider(url);
  if (!detected) return;
  if (seenRecently(url)) return;

  const from = msg.key.remoteJid;
  const sender = msg.key.participant || from;

  try {
    await sock.sendMessage(from, { text: `🔗 ${detected.name} link detected — downloading…` }, { quoted: msg });

    const { promise } = enqueue({
      userJid: sender,
      label: url,
      run: () => detected.provider.downloadVideo(url),
    });

    const result = await promise;
    await sendDownloadResult(sock, from, msg, result, '📥 ');
  } catch (err) {
    if (err.cancelled) return;
    const message =
      err instanceof DownloaderError ? `⚠️ ${err.message}` : '❌ Could not download that link.';
    await sock.sendMessage(from, { text: message }, { quoted: msg }).catch(() => {});
  }
}

module.exports = { registerLinkDetectionHandler };
