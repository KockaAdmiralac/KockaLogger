#!/usr/bin/env node
/**
 * main.js
 *
 * CLI entry point of KockaLogger.
 */
'use strict';

const process = require('process');
const Client = require('./include/client.js');
const IO = require('./include/io.js');
const Logger = require('./include/log.js');
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

let client = null;
let loader = null;

/**
 * Stop KockaLogger.
 */
async function kill() {
    if (loader) {
        await loader.kill();
    }
    if (client) {
        await client.kill();
    }
}

/**
 * Run KockaLogger.
 */
async function main() {
    const fetch = option('fetch');
    const debug = option('debug');
    Logger.setup(config, debug, new IO());
    loader = new Loader(config, {
        debug,
        fetch
    });
    const caches = await loader.run();
    if (fetch) {
        await kill();
        return;
    }
    client = new Client(config, {debug});
    await client.run(caches, loader);
}

process.on('SIGINT', kill);
main();
