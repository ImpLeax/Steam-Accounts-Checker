'use strict';

require('dotenv').config({ quiet: true });

const path = require('path');

function parseBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

const config = {
  steamApiKey: process.env.STEAM_API_KEY || '',

  paths: {
    dataDir,
    accounts: path.join(dataDir, 'accounts.txt'),
    steamIds: path.join(dataDir, 'steam_ids.txt'),
    clean: path.join(dataDir, 'clean.txt'),
    banned: path.join(dataDir, 'banned.txt'),
  },

  imap: {
    host: process.env.IMAP_HOST || 'imap.firstmail.ltd',
    port: parseInteger(process.env.IMAP_PORT, 993),
    secure: parseBool(process.env.IMAP_SECURE, true),
    socketTimeoutMs: parseInteger(process.env.IMAP_SOCKET_TIMEOUT_MS, 15000),
    attempts: parseInteger(process.env.IMAP_ATTEMPTS, 12),
    retryDelayMs: parseInteger(process.env.IMAP_RETRY_DELAY_MS, 2000),
    steamFromAddress: process.env.STEAM_GUARD_FROM || 'noreply@steampowered.com',
  },

  extract: {
    concurrency: parseInteger(process.env.CONCURRENCY, 5),
    connectTimeoutMs: parseInteger(process.env.CONNECT_TIMEOUT_MS, 25000),
    afterCodeTimeoutMs: parseInteger(process.env.AFTER_CODE_TIMEOUT_MS, 15000),
  },

  ipRotation: {
    enabled: parseBool(process.env.IP_ROTATION_ENABLED, false),
    disableDelayMs: parseInteger(process.env.IP_ROTATION_DISABLE_DELAY_MS, 3000),
    enableDelayMs: parseInteger(process.env.IP_ROTATION_ENABLE_DELAY_MS, 8000),
  },

  banCheck: {
    chunkSize: parseInteger(process.env.BAN_CHECK_CHUNK_SIZE, 100),
  },
};

function requireApiKey() {
  if (!config.steamApiKey) {
    throw new Error('STEAM_API_KEY is missing. Set it in your .env file (see .env.example).');
  }
}

module.exports = { config, requireApiKey };
