'use strict';

const { config } = require('../../config');

/**
 * Music settings live on `config` under flat dotted keys ('music.enabled'),
 * so the existing settingsStore/.config plumbing can read and write them
 * without a nested-key parser. This module is the single place that knows
 * the key names and the fallbacks.
 */

const DEFAULTS = {
  enabled: true,
  defaultQuality: 'medium',
  maxFileSize: 50, // MB
  maxDuration: 600, // seconds
  maxConcurrentDownloads: 2,
  autoLinkDetection: false,
};

const QUALITY_PRESETS = {
  low: { audioQuality: '9', bitrate: '64k' },
  medium: { audioQuality: '5', bitrate: '128k' },
  high: { audioQuality: '2', bitrate: '192k' },
};

function musicSetting(name) {
  const value = config[`music.${name}`];
  return value === undefined || value === null || value === '' ? DEFAULTS[name] : value;
}

function qualityPreset(name) {
  return QUALITY_PRESETS[name] || QUALITY_PRESETS[DEFAULTS.defaultQuality];
}

module.exports = { musicSetting, qualityPreset, QUALITY_PRESETS, DEFAULTS };
