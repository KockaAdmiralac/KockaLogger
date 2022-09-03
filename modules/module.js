/**
 * module.js
 *
 * Base module for... modules.
 */
'use strict';

const Client = require('../include/client.js');
const Message = require('../parser/msg.js');

/**
 * Base module class.
 */
class Module {
    /**
     * Class constructor.
     * @param {object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        this._config = config;
        this._client = client;
        this._cache = client.cache;
        this._io = client.io;
    }
    /**
     * Sets up required caches.
     * @param {object} caches Cached system message data from loader
     */
    setup(caches) {
        this._caches = caches;
    }
    /**
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} _message Message to check
     * @returns {boolean | string | Array} Set(s) of expected properties
     */
    interested(_message) {
        return false;
    }
    /**
     * Handles messages.
     * @param {Message} message Received message
     * @throws {Error} If not implemented
     */
    execute(message) {
        if (message.type) {
            throw new Error('Implement this method!');
        }
    }
    /* eslint-disable no-empty-function */
    /**
     * Disposes resources used by the module so KockaLogger can cleanly exit.
     */
    kill() {}
    /* eslint-enable */
}

module.exports = Module;
