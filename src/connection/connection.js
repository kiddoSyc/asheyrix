'use strict';

const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcodeTerminal = require('qrcode-terminal');

const { config } = require('../config');
const logger = require('../utils/logger');

/**
 * Starts (or restarts) the WhatsApp socket connection.
 *
 * @param {object} opts
 * @param {(sock: import('@whiskeysockets/baileys').WASocket) => void} opts.onReady
 *        Called every time a fresh, usable socket is created (including after
 *        a reconnect), so the caller can (re)attach message/event listeners.
 * @returns {Promise<import('@whiskeysockets/baileys').WASocket>}
 */
async function startConnection({ onReady }) {
  const authDir = path.resolve(process.cwd(), config.authDir);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  logger.info(
    { version, isLatest },
    'Using Baileys/WhatsApp Web protocol version'
  );

  const usePairing =
    config.loginMethod === 'pairing' && !state.creds.registered;

  const sock = makeWASocket({
    version,
    logger: logger.child({ module: 'baileys' }),
    auth: state,
    browser: Browsers.macOS('Desktop'),
    // We render our own QR (with clearer framing) instead of Baileys' default.
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  // Request a pairing code once the socket exists, if configured to do so
  // and we are not already registered/logged in.
  if (usePairing) {
    // Baileys needs a brief moment after socket creation before a pairing
    // code can be requested.
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(config.pairingNumber);
        logger.info(`Pairing code for ${config.pairingNumber}: ${code}`);
        console.log('\n=========================================');
        console.log(`  WhatsApp pairing code: ${code}`);
        console.log('  Enter this in WhatsApp > Linked Devices');
        console.log('=========================================\n');
      } catch (err) {
        logger.error({ err }, 'Failed to request pairing code');
      }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    handleConnectionUpdate(update, { onReady, sock, startConnection: () => startConnection({ onReady }) });
  });

  return sock;
}

function handleConnectionUpdate(update, { onReady, sock, startConnection: reconnect }) {
  const { connection, lastDisconnect, qr } = update;

  if (qr && config.loginMethod === 'qr') {
    console.log('\nScan this QR code with WhatsApp (Linked Devices > Link a device):\n');
    qrcodeTerminal.generate(qr, { small: true });
  }

  if (connection === 'connecting') {
    logger.info('Connecting to WhatsApp...');
  }

  if (connection === 'open') {
    logger.info('WhatsApp connection established.');
    if (typeof onReady === 'function') {
      onReady(sock);
    }
  }

  if (connection === 'close') {
    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    logger.warn(
      { statusCode, loggedOut },
      'Connection closed.'
    );

    if (loggedOut) {
      logger.error(
        'Session was logged out from the phone. Delete the auth/ folder and restart to log in again.'
      );
      return;
    }

    // Any other reason (connection lost, restart required, timed out, etc.)
    // -> reconnect automatically.
    logger.info('Reconnecting...');
    reconnect().catch((err) => {
      logger.error({ err }, 'Reconnection attempt failed.');
    });
  }
}

module.exports = { startConnection };
