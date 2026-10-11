'use strict';

const fs = require('fs');
const { config } = require('./config');
const { logger } = require('./logger');
const { parseAccountLine } = require('./accountParser');
const { resolveSteamId } = require('./steamClient');
const { rotateIp } = require('./ipRotator');

function readAccountLines() {
  return fs
    .readFileSync(config.paths.accounts, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function processLine(line, index, total, stats) {
  const label = `[${index}/${total}] `;
  const account = parseAccountLine(line);

  if (!account) {
    logger.warn(`${label}[-] Invalid format: ${line.slice(0, 40)}...`);
    stats.failed++;
    return;
  }

  logger.info(`${label}[*] Connecting: ${account.login}...`);
  const result = await resolveSteamId(account, label);

  switch (result.status) {
    case 'success':
      logger.info(`${label}[+] Success: ${account.login} -> ${result.steamId}`);
      fs.appendFileSync(config.paths.steamIds, `${result.steamId}\n`);
      stats.success++;
      break;
    case 'timeout':
      logger.warn(`${label}[-] Timeout: ${account.login}`);
      stats.timeout++;
      break;
    case 'steamGuardFail':
      logger.warn(`${label}[-] Steam Guard code not found: ${account.login}`);
      stats.steamGuardFail++;
      break;
    default:
      logger.error(
        `${label}[-] Error [${account.login}]: ${result.errorType}` +
          (result.message ? ` -> ${result.message}` : '')
      );
      stats.failed++;
  }
}

/**
 * Reads the accounts file, logs into each account in concurrency-limited
 * batches, appends resolved SteamID64s to the output file, and rotates the IP
 * between batches when enabled.
 */
async function extractIds() {
  if (!fs.existsSync(config.paths.accounts)) {
    logger.error(`Accounts file not found: ${config.paths.accounts}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(config.paths.dataDir, { recursive: true });

  const lines = readAccountLines();
  const total = lines.length;
  const stats = { success: 0, failed: 0, timeout: 0, steamGuardFail: 0 };

  logger.info(`Loaded ${total} accounts`);
  logger.info(
    `Settings: ${config.extract.concurrency} concurrent | connect timeout ` +
      `${config.extract.connectTimeoutMs / 1000}s | IP rotation ${config.ipRotation.enabled ? 'on' : 'off'}`
  );

  const { concurrency } = config.extract;

  for (let i = 0; i < total; i += concurrency) {
    const batch = lines.slice(i, i + concurrency);
    logger.info(
      `--- Batch ${Math.floor(i / concurrency) + 1}: accounts ${i + 1}-${Math.min(i + concurrency, total)} ---`
    );

    await Promise.all(
      batch.map((line, batchIndex) => processLine(line, i + batchIndex + 1, total, stats))
    );

    if (i + concurrency < total) {
      await rotateIp();
    }
  }

  logger.info('==============================');
  logger.info('Finished extracting SteamIDs');
  logger.info(`Success:          ${stats.success}`);
  logger.info(`Failed:           ${stats.failed}`);
  logger.info(`Timeouts:         ${stats.timeout}`);
  logger.info(`SteamGuard fail:  ${stats.steamGuardFail}`);
  logger.info('==============================');
}

module.exports = { extractIds };
