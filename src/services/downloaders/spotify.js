'use strict';

const https = require('https');
const { URL } = require('url');
const { config } = require('../../config');
const { DownloaderError } = require('./errors');

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new DownloaderError('Spotify returned an unexpected response.', 'FETCH_FAILED'));
            }
          } else {
            reject(new DownloaderError(`Spotify responded with status ${res.statusCode}.`, 'FETCH_FAILED'));
          }
        });
      })
      .on('error', (err) => reject(new DownloaderError(err.message, 'FETCH_FAILED')));
  });
}

function test(url) {
  try {
    return new URL(url).hostname.endsWith('open.spotify.com');
  } catch {
    return false;
  }
}

/**
 * Metadata only, via Spotify's public oEmbed endpoint — no API key needed.
 * This NEVER returns audio. Spotify's DRM/access controls are not
 * bypassed here or anywhere else in this bot; audio must come from a
 * separate, lawful source (e.g. the YouTube provider) if you want the
 * actual track.
 */
async function getMetadata(url) {
  if (!test(url)) {
    throw new DownloaderError('This is not a Spotify link.', 'UNSUPPORTED_URL');
  }
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const data = await fetchJson(oembedUrl);
  return { title: data.title, thumbnail: data.thumbnail_url };
}

let cachedToken = null;

async function getAccessToken() {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    throw new DownloaderError(
      'Spotify search requires API credentials. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env to enable it.',
      'TOOL_MISSING'
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const body = 'grant_type=client_credentials';
  const auth = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64');

  const token = await new Promise((resolve, reject) => {
    const req = https.request(
      'https://accounts.spotify.com/api/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (!json.access_token) throw new Error('no access_token');
            resolve(json);
          } catch {
            reject(new DownloaderError('Failed to authenticate with Spotify.', 'FETCH_FAILED'));
          }
        });
      }
    );
    req.on('error', (err) => reject(new DownloaderError(err.message, 'FETCH_FAILED')));
    req.write(body);
    req.end();
  });

  cachedToken = { token: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000 };
  return cachedToken.token;
}

async function search(query, type = 'track') {
  const token = await getAccessToken();
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=5`;
  const data = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
  const items = data[`${type}s`]?.items || [];
  return items.map((item) => ({
    name: item.name,
    artists: (item.artists || []).map((a) => a.name).join(', '),
    url: item.external_urls?.spotify,
  }));
}

module.exports = { test, getMetadata, search };
