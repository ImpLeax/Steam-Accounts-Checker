'use strict';

const SteamUser = require('steam-user');
const { config } = require('./config');
const { logger } = require('./logger');
const { getSteamGuardCode } = require('./mailbox');

let guardsInstalled = false;

/**
 * steam-user can emit an internal error referencing "reading 'destroy'" when a
 * connection is torn down mid-handshake. It is harmless for this use case, so
 * we swallow only that specific message and let every other error surface.
 */
function installProcessGuards() {
  if (guardsInstalled) return;
  guardsInstalled = true;

  process.on('uncaughtException', (err) => {
    if (err && err.message && err.message.includes("reading 'destroy'")) return;
    logger.error('Uncaught exception:', err.message);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });
}

function classifySteamError(message) {
  if (/RateLimit/i.test(message)) return 'RateLimit';
  if (/Invalid(Password|Login)/i.test(message)) return 'InvalidPassword';
  if (/(AccountLogonDenied|LogonDenied)/i.test(message)) return 'LogonDenied';
  if (/LoggedInElsewhere/i.test(message)) return 'LoggedInElsewhere';
  if (/AccountDisabled/i.test(message)) return 'AccountDisabled';
  return 'Unknown';
}

/**
 * Logs into a single Steam account and resolves its SteamID64.
 *
 * Always resolves (never rejects) with a result object so the caller can run
 * many accounts concurrently without one failure aborting the batch:
 *   { status: 'success', steamId }
 *   { status: 'timeout' }
 *   { status: 'steamGuardFail' }
 *   { status: 'failed', errorType, message? }
 */
function resolveSteamId(account, label = '') {
  installProcessGuards();

  const client = new SteamUser();

  return new Promise((resolve) => {
    let settled = false;
    let timeout = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);

      client.removeListener('loggedOn', onLoggedOn);
      client.removeListener('steamGuard', onSteamGuard);
      client.removeListener('error', onError);

      try {
        client.logOff();
      } catch (_) {
        // ignore logOff failures during teardown
      }

      // Give steam-user a moment to close its socket before resolving.
      setTimeout(() => resolve(result), 300);
    };

    const onLoggedOn = () => {
      try {
        const steamId = client.steamID.getSteamID64();
        settle({ status: 'success', steamId });
      } catch (err) {
        settle({ status: 'failed', errorType: `SteamIDError: ${err.message}` });
      }
    };

    const onSteamGuard = async (domain, callback) => {
      logger.info(`${label}[!] Steam Guard required: ${account.login}`);
      if (timeout) clearTimeout(timeout);

      const code = await getSteamGuardCode(account.email, account.emailPassword);
      if (!code) {
        settle({ status: 'steamGuardFail' });
        return;
      }

      logger.info(`${label}[+] Code found: ${code}`);
      try {
        callback(code);
      } catch (err) {
        settle({ status: 'failed', errorType: `CallbackError: ${err.message}` });
        return;
      }

      timeout = setTimeout(() => {
        settle({ status: 'timeout' });
      }, config.extract.afterCodeTimeoutMs);
    };

    const onError = (err) => {
      const message = err.message || String(err);
      settle({ status: 'failed', errorType: classifySteamError(message), message });
    };

    timeout = setTimeout(() => {
      settle({ status: 'timeout' });
    }, config.extract.connectTimeoutMs);

    client.on('loggedOn', onLoggedOn);
    client.on('steamGuard', onSteamGuard);
    client.on('error', onError);

    try {
      client.logOn({ accountName: account.login, password: account.password });
    } catch (err) {
      settle({ status: 'failed', errorType: `LogOnError: ${err.message}` });
    }
  });
}

module.exports = { resolveSteamId };
