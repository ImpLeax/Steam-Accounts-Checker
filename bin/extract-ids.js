#!/usr/bin/env node
'use strict';

const { extractIds } = require('../src/extractIds');

extractIds()
  .then(() => {
    // steam-user may keep sockets open; exit explicitly once the run is done.
    process.exit(process.exitCode || 0);
  })
  .catch((err) => {
    console.error('[FATAL] Run error:', err);
    process.exit(1);
  });
