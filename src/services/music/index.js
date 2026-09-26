'use strict';

const fs = require('fs');
const { runYtDlp } = require('../downloaders/ytdlpRunner');
const { runYtDlpJson } = require('./ytdlpJson');
const { DownloaderError } = require('../downloaders/errors');
const { makeTempPath, cleanupTempFile, TEMP_DIR, ensureTempDir } = require('../downloaders/tempFile');
const { musicSetting, qualityPreset } = require('./settings');
const { runFfmpeg } = require('../media/ffmpegRunner');
const logger = require('../../utils/logger');

const YT_URL = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;
const MAX_QUERY_LENGTH = 150;

function isYouTubeUrl(value) {
  return YT_URL.test(String(value || '').trim());
}

/**
 * User input reaches yt-dlp as a plain argv entry, never a shell string,
 * but a query is still rejected if it looks like an attempt to smuggle
 * options in (a leading dash would be read as a flag).
 */
function cleanQuery(query) {
  const trimmed = String(query || '').trim().replace(/^-+/, '').slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) throw new DownloaderError('Give me something to search for.', 'UNSUPPORTED_URL');
  return trimmed;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'unknown';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function normalizeEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    title: entry.title || 'Unknown title',
    url: entry.webpage_url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null),
    duration: Number(entry.duration) || 0,
    uploader: entry.uploader || entry.channel || entry.artist || 'Unknown',
    artist: entry.artist || entry.creator || entry.uploader || null,
    album: entry.album || null,
    views: Number(entry.view_count) || 0,
    thumbnail: entry.thumbnail || null,
  };
}

/**
 * Searches YouTube through yt-dlp's `ytsearchN:` pseudo-URL, so there's no
 * scraping code and no API key to manage.
 */
async function search(query, limit = 5) {
  const safeLimit = Math.min(10, Math.max(1, Number(limit) || 5));
  const data = await runYtDlpJson([
    `ytsearch${safeLimit}:${cleanQuery(query)}`,
    '-J',
    '--flat-playlist',
  ]);

  const entries = Array.isArray(data.entries) ? data.entries : [];
  return entries.map(normalizeEntry).filter((e) => e && e.url);
}

/** Full metadata for a single video URL. */
async function getInfo(url) {
  if (!isYouTubeUrl(url)) {
    throw new DownloaderError('That is not a YouTube link.', 'UNSUPPORTED_URL');
  }
  return normalizeEntry(await runYtDlpJson([url, '-J']));
}

/**
 * Resolves whatever the user typed — a URL or a search phrase — into one
 * track, preferring results that fit the configured duration cap so a
 * one-hour "full album" upload doesn't win over the actual song.
 */
async function resolveTrack(input) {
  const value = String(input || '').trim();
  if (isYouTubeUrl(value)) return getInfo(value);

  const results = await search(value, 5);
  if (results.length === 0) throw new DownloaderError('No results found for that.', 'FETCH_FAILED');

  const maxDuration = musicSetting('maxDuration');
  const suitable = results.find((r) => r.duration > 0 && r.duration <= maxDuration);
  return suitable || results[0];
}

function assertWithinLimits(track) {
  const maxDuration = musicSetting('maxDuration');
  if (track.duration && track.duration > maxDuration) {
    throw new DownloaderError(
      `That track is ${formatDuration(track.duration)} — over the ${formatDuration(maxDuration)} limit.`,
      'TOO_LARGE'
    );
  }
}

function assertFileSize(filePath) {
  const maxBytes = musicSetting('maxFileSize') * 1024 * 1024;
  const { size } = fs.statSync(filePath);
  if (size > maxBytes) {
    cleanupTempFile(filePath);
    throw new DownloaderError(
      `The finished file is over the ${musicSetting('maxFileSize')}MB limit.`,
      'TOO_LARGE'
    );
  }
  return size;
}

/**
 * Downloads a track's audio as mp3 at the requested quality.
 * @returns {Promise<{filePath: string, title: string, track: object}>}
 */
async function downloadAudio(track, quality) {
  assertWithinLimits(track);
  const preset = qualityPreset(quality || musicSetting('defaultQuality'));

  const result = await runYtDlp(track.url, [
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', preset.audioQuality,
  ]);

  assertFileSize(result.filePath);
  return { ...result, title: result.title || track.title, track };
}

/**
 * Converts an mp3 to an opus/ogg voice note. WhatsApp will play an mp3 as
 * an audio message, but only opus shows up as a real push-to-talk bubble.
 */
async function toVoiceNote(mp3Path) {
  const outputPath = makeTempPath('.ogg');
  await runFfmpeg([
    '-i', mp3Path,
    '-c:a', 'libopus',
    '-b:a', '64k',
    '-vbr', 'on',
    '-ar', '48000',
    '-ac', '1',
    outputPath,
  ]);
  return outputPath;
}

/**
 * Downloads just the cover art / video thumbnail.
 */
async function downloadThumbnail(track) {
  if (!track.url) throw new DownloaderError('No link to fetch artwork from.', 'FETCH_FAILED');
  ensureTempDir();

  const result = await runYtDlp(track.url, [
    '--skip-download',
    '--write-thumbnail',
    '--convert-thumbnails', 'jpg',
  ]).catch((err) => {
    logger.warn({ err: err.message }, 'Thumbnail download failed.');
    throw err;
  });

  return result;
}

module.exports = {
  search,
  getInfo,
  resolveTrack,
  downloadAudio,
  downloadThumbnail,
  toVoiceNote,
  formatDuration,
  isYouTubeUrl,
  TEMP_DIR,
};
