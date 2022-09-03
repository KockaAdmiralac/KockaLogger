#!/usr/bin/env node
/**
 * main.js
 *
 * CLI entry point of KockaLogger.
 */
'use strict';

const process = require('process');
const Client = require('./include/client.js');
const Loader = require('./messages/main.js');

const optionCache = {};
const {argv, exit} = process;

/**
 * Checks whether an option is in executable arguments.
 * @param {string} opt Option to check
 * @returns {boolean} Whether the specified option is in arguments
 */
function option(opt) {
    if (optionCache[opt]) {
        return true;
    }
    const arg = argv.includes(`--${opt}`);
    optionCache[opt] = arg;
    return arg;
}

/**
 * Load the configuration.
 */
let config = {};
try {
    /* eslint-disable node/no-unpublished-require */
    /* eslint-disable node/no-missing-require */
    config = require('./config.json');
    /* eslint-enable node/no-unpublished-require */
    /* eslint-enable node/no-missing-require */
} catch (error) {
    console.error(
        'You forgot to rename config.sample.json or your config.json has ' +
        'a syntax error',
        error
    );
    exit(1);
}

const fetch = option('fetch');
const debug = option('debug');
const client = new Client(config, {debug});
const loader = new Loader(config, {
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
