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
const Client = require('./include/client.js'),
      Loader = require('./messages/main.js');

/**
 * Constants
 */
const optionCache = {};

/**
 * Checks whether an option is in executable arguments.
 * @param {String} opt Option to check
 * @returns {Boolean} Whether the specified option is in arguments
 */
function option(opt) {
    if (optionCache[opt]) {
        return true;
    }
    const arg = process.argv.includes(`--${opt}`);
    optionCache[opt] = arg;
    return arg;
}

/**
 * Load the configuration.
 */
let config = {};
try {
    config = require('./config.json');
} catch (error) {
    console.error(
        'You forgot to rename config.sample.json or your config.json has ' +
        'a syntax error',
        error
    );
    process.exit(1);
}

const fetch = option('fetch'),
      debug = option('debug'),
      client = new Client(config, {debug}),
      loader = new Loader(config, {
          debug,
          fetch
      });

/**
 * Stop KockaLogger.
 */
async function kill() {
    await loader.kill();
    await client.kill();
}

/**
 * Run KockaLogger.
 */
async function main() {
    const caches = await loader.run();
    if (fetch) {
        await kill();
        return;
    }
    await client.run(caches, loader);
}

process.on('SIGINT', kill);
main();
