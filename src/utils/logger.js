'use strict';

const path = require('path');
const pino = require('pino');
const { config } = require('../config');

// Fields that must never hit the logs even if accidentally passed in.
// This applies before the message reaches ANY transport below, console or
// file, so console output and the on-disk log file are equally protected.
const REDACT_PATHS = [
  'creds',
  '*.creds',
  'sessionData',
  'apiKey',
  'apikey',
  'token',
  'password',
  '*.token',
  '*.password',
  '*.apiKey',
];

// One log file per calendar day — simple, dependency-free rotation. Old
// files are never deleted automatically; clean up logs/ periodically if
// disk space matters on your machine.
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const logFilePath = path.resolve(process.cwd(), 'logs', `${today}.log`);

const targets = [];

// Console output: pretty-printed if PRETTY_LOGS=true, otherwise plain JSON
// lines to stdout (useful if you ever pipe this into another log tool).
targets.push(
  config.prettyLogs
    ? {
        target: 'pino-pretty',
        level: config.logLevel,
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : {
        target: 'pino/file',
        level: config.logLevel,
        options: { destination: 1 }, // fd 1 = stdout
      }
);

// Always also write structured JSON lines to disk, regardless of the
// console format, so history survives after the terminal is closed.
targets.push({
  target: 'pino/file',
  level: config.logLevel,
  options: {
    destination: logFilePath,
    mkdir: true,
  },
});

const logger = pino({
  level: config.logLevel,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  transport: { targets },
});

module.exports = logger;
