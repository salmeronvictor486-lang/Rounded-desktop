#!/usr/bin/env node
'use strict';
// Exit quietly when the output is piped into a command that stops reading (e.g. `| head`).
process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});
process.exitCode = require('../src/cli').main(process.argv.slice(2));
