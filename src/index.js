'use strict';

const path = require('path');
const { config, validateConfig } = require('./config');
const logger = require('./utils/logger');
const { startConnection } = require('./connection/connection');
const { loadCommands } = require('./handlers/commandLoader');
const { attachMessageBus, subscriberCount } = require('./handlers/messageBus');
const { registerMessageHandler } = require('./handlers/messageHandler');
const { registerViewOnceHandler } = require('./handlers/viewOnceHandler');
const { registerViewOnceTriggerHandler } = require('./handlers/viewOnceTriggerHandler');
const { registerAntiDeleteHandler } = require('./handlers/antiDeleteHandler');
const { registerStatusHandler } = require('./handlers/statusHandler');
const { registerGroupEventsHandler } = require('./handlers/groupEventsHandler');
const { registerGroupModerationHandler } = require('./handlers/groupModerationHandler');
const { registerAiChatHandler } = require('./handlers/aiChatHandler');
const { registerLinkDetectionHandler } = require('./handlers/linkDetectionHandler');
const { sendConnectNotification } = require('./lib/ownerNotify');
const { applyPersistedSettings } = require('./database/settingsStore');
const { runStartupDiagnostics } = require('./lib/diagnostics');

let shuttingDown = false;

async function main() {
  applyPersistedSettings(config);

  logger.info(`Starting ${config.botName}...`);

  const problems = validateConfig(config);
  for (const problem of problems) {
    logger.warn(problem);
  }

  await runStartupDiagnostics();

  const commandsDir = path.join(__dirname, 'commands');
  const commands = loadCommands(commandsDir);

  await startConnection({
    onReady(sock) {
      // Order matters in one respect: every register* call must run before
      // attachMessageBus, so the single listener is wired up with the full
      // set of subscribers already in place.
      registerMessageHandler(sock, { commands });
      registerViewOnceHandler(sock);
      registerViewOnceTriggerHandler(sock);
      registerAntiDeleteHandler(sock);
      registerStatusHandler(sock);
      registerGroupModerationHandler(sock);
      registerAiChatHandler(sock, { commands });
      registerLinkDetectionHandler(sock);

      // Group participant events are a different Baileys event, so this one
      // still binds directly to the socket rather than through the bus.
      registerGroupEventsHandler(sock);

      attachMessageBus(sock);

      logger.info(
        {
          mode: config.botMode,
          prefix: config.prefix,
          commands: commands.all.length,
          subscribers: subscriberCount(),
          ai: config.aiEnabled ? config.aiProvider : 'off',
        },
        'Bot is ready and listening for commands.'
      );

      sendConnectNotification(sock).catch((err) => {
        logger.error({ err }, 'Unexpected error sending connect notification.');
      });
    },
  });
}

/**
 * An unhandled rejection is almost always a missing `.catch` somewhere, not
 * a reason to die — a single failed media download shouldn't drop the
 * WhatsApp session. Logged loudly so it still gets fixed.
 */
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection (bot kept running).');
});

/**
 * An uncaught exception is different: by the time it reaches here the stack
 * has already unwound and the process may hold half-updated state. Node's
 * own guidance is to exit, and a supervisor (pm2, systemd, a Docker restart
 * policy) brings it back clean. The previous version logged and carried on,
 * which risked running with a corrupted auth session — the one piece of
 * state that is genuinely painful to rebuild.
 */
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting so the supervisor can restart cleanly.');
  shutdown(1);
});

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Shutting down...');

  // Give pino's transports a moment to flush to disk; without this the last
  // few log lines — usually the interesting ones — are lost on exit.
  setTimeout(() => process.exit(code), 250).unref();
}

process.on('SIGINT', () => {
  logger.info('Received SIGINT.');
  shutdown(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM.');
  shutdown(0);
});

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error during startup.');
  process.exit(1);
});
