#!/usr/bin/env node
/**
 * main.js
 *
 * CLI entry point of KockaLogger.
 */
'use strict';

/**
 * Importing modules.
 */
const CLI = require('./controllers/cli/main.js');

/**
 * Runs KockaLogger.
 */
const cli = new CLI();
cli.run();
