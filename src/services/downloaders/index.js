'use strict';

const direct = require('./direct');
const youtube = require('./youtube');
const tiktok = require('./tiktok');
const twitter = require('./twitter');
const facebook = require('./facebook');
const soundcloud = require('./soundcloud');
const instagram = require('./instagram');
const pinterest = require('./pinterest');
const mediafire = require('./mediafire');
const spotify = require('./spotify');

const providers = {
  direct,
  youtube,
  tiktok,
  twitter,
  facebook,
  soundcloud,
  instagram,
  pinterest,
  mediafire,
  spotify,
};

/**
 * Finds the first non-generic provider whose test() claims a URL. Useful
 * for a future ".dl <url>" auto-detect command; today's commands mostly
 * call their provider directly, but this keeps the option open without
 * hardcoding any one provider elsewhere.
 */
function detectProvider(url) {
  for (const [name, provider] of Object.entries(providers)) {
    if (name === 'direct' || name === 'spotify') continue;
    if (provider.test && provider.test(url)) return { name, provider };
  }
  return null;
}

module.exports = { providers, detectProvider };
