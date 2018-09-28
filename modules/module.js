/**
 * module.js
 *
 * Base module for... modules.
 */
'use strict';

/**
 * Base module class
 */
class Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        this._config = config;
        this._client = client;
    }
    /**
     * Sets up required caches
     * @param {Object} caches Cached system message data from loader
     */
    setup(caches) {
        this._caches = caches;
    }
    /**
     * Handles messages
     * @param {Message} message Received message
     */
    execute(message) {
        if (message.type) {
            throw new Error('Implement this method!');
        }
    }
}

module.exports = Module;
