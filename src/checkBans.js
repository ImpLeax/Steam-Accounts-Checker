'use strict';

const fs = require('fs');
const { config, requireApiKey } = require('./config');
const { logger } = require('./logger');

const BAN_API_URL = 'https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/';

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function readSteamIds() {
  return fs
    .readFileSync(config.paths.steamIds, 'utf-8')
    .split(/\r?\n/)
    .map((id) => id.trim())
    .filter((id) => id && !id.startsWith('#'));
}

/**
 * Reads harvested SteamID64s, queries the Steam Web API GetPlayerBans endpoint
 * in chunks, and writes clean / banned IDs to separate files. Output files are
 * truncated at the start so repeated runs do not accumulate duplicates.
 */
async function checkBans() {
  requireApiKey();

  if (!fs.existsSync(config.paths.steamIds)) {
    logger.error(`SteamIDs file not found: ${config.paths.steamIds}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(config.paths.dataDir, { recursive: true });

  const steamIds = readSteamIds();
  logger.info(`Loaded ${steamIds.length} SteamIDs for verification.`);

  fs.writeFileSync(config.paths.clean, '');
  fs.writeFileSync(config.paths.banned, '');

  const batches = chunk(steamIds, config.banCheck.chunkSize);
  let cleanCount = 0;
  let bannedCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    logger.info(`[*] Processing batch ${i + 1}/${batches.length} (${batch.length} IDs)...`);

    const url = new URL(BAN_API_URL);
    url.searchParams.set('key', config.steamApiKey);
    url.searchParams.set('steamids', batch.join(','));

    try {
      const response = await fetch(url);
      logger.info(`[*] API status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        logger.error('Request failed for this batch.');
        continue;
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.players)) {
        logger.error('Unexpected API response structure.');
        continue;
      }

      for (const player of data.players) {
        const isBanned =
          player.VACBanned || player.CommunityBanned || player.EconomyBan !== 'none';

        if (isBanned) {
          logger.info(
            `  -> [BANNED] ${player.SteamId} | VAC: ${player.VACBanned} | ` +
              `Community: ${player.CommunityBanned} | Trade: ${player.EconomyBan}`
          );
          fs.appendFileSync(config.paths.banned, `${player.SteamId}\n`);
          bannedCount++;
        } else {
          logger.info(`  -> [CLEAN] ${player.SteamId}`);
          fs.appendFileSync(config.paths.clean, `${player.SteamId}\n`);
          cleanCount++;
        }
      }
    } catch (err) {
      logger.error(`API request failed: ${err.message}`);
    }
  }

  logger.info('=========================================');
  logger.info('Validation completed.');
  logger.info(`Total Clean:  ${cleanCount}`);
  logger.info(`Total Banned: ${bannedCount}`);
  logger.info('=========================================');
}

module.exports = { checkBans };
