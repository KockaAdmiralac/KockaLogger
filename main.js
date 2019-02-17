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
} catch (e) {
    console.error(
        'You forgot to rename config.sample.json or your config.json has' +
        'a syntax error',
        e
    );
}

/**
 * Initialize client and loader.
 */
const loader = new Loader(config, {
    debug: option('debug'),
    fetch: option('fetch'),
    generate: option('generate')
}), client = new Client(config, {
    debug: option('debug')
}, loader);

/**
 * Load system messages and run the client.
 */
loader.run(client.run, client);
