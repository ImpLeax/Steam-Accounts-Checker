'use strict';

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { config } = require('./config');
const { logger } = require('./logger');

// Steam Guard codes are five uppercase alphanumeric characters. Prefer the
// code rendered inside the email's <h2> element and fall back to the first
// standalone 5-character token if the markup changes.
const STEAM_GUARD_CODE = /<h2[^>]*>\s*([A-Z0-9]{5})\s*<\/h2>/i;
const STEAM_GUARD_CODE_FALLBACK = /\b([A-Z0-9]{5})\b/;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCode(text) {
  const match = text.match(STEAM_GUARD_CODE) || text.match(STEAM_GUARD_CODE_FALLBACK);
  return match ? match[1].replace(/<[^>]*>?/gm, '').trim() : null;
}

/**
 * Polls the account mailbox over IMAP for the latest unseen Steam Guard email
 * and returns the login code, or null if none is found within the retry budget.
 */
async function getSteamGuardCode(email, emailPassword) {
  if (!email || !emailPassword) {
    logger.warn('[IMAP] Missing email credentials; cannot fetch Steam Guard code.');
    return null;
  }

  const imap = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: email, pass: emailPassword },
    logger: false,
    socketTimeout: config.imap.socketTimeoutMs,
  });

  try {
    await imap.connect();
    const lock = await imap.getMailboxLock('INBOX');

    try {
      for (let attempt = 1; attempt <= config.imap.attempts; attempt++) {
        const uids = await imap.search(
          { from: config.imap.steamFromAddress, seen: false },
          { uid: true }
        );

        if (uids && uids.length > 0) {
          const latestUid = uids[uids.length - 1];
          const message = await imap.fetchOne(latestUid, { source: true });

          if (message && message.source) {
            const parsed = await simpleParser(message.source);
            const code = extractCode(parsed.text || parsed.html || '');
            if (code) return code;
          }
        }

        if (attempt < config.imap.attempts) {
          await delay(config.imap.retryDelayMs);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.error(`[IMAP] Error [${email}]: ${err.message}`);
  } finally {
    try {
      await imap.logout();
    } catch (_) {
      // ignore logout failures
    }
  }

  return null;
}

module.exports = { getSteamGuardCode };
