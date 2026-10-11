'use strict';

const util = require('util');
const { exec } = require('child_process');
const { config } = require('./config');
const { logger } = require('./logger');

const execAsync = util.promisify(exec);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rotates the outbound IP by toggling airplane mode on an ADB-connected phone
 * tethered to this machine. It is a no-op unless IP_ROTATION_ENABLED is set, so
 * the project runs on any machine without adb or a connected device.
 */
async function rotateIp() {
  if (!config.ipRotation.enabled) {
    logger.debug('[IP] Rotation disabled (set IP_ROTATION_ENABLED=true to enable).');
    return;
  }

  logger.info('[IP] Rotating IP via ADB...');
  try {
    await execAsync('adb shell cmd connectivity airplane-mode enable');
    await delay(config.ipRotation.disableDelayMs);
    await execAsync('adb shell cmd connectivity airplane-mode disable');
    await delay(config.ipRotation.enableDelayMs);
    logger.info('[IP] Rotation completed.');
  } catch (err) {
    logger.error(`[IP] ADB rotation failed: ${err.message}`);
  }
}

module.exports = { rotateIp };
