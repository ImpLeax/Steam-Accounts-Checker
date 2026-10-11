#!/usr/bin/env node
'use strict';

const { checkBans } = require('../src/checkBans');

checkBans().catch((err) => {
  console.error('[FATAL] Run error:', err);
  process.exit(1);
});
