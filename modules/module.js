/**
 * module.js
 *
 * Base module for... modules.
 */
'use strict';

/**
 * Base module class.
 */
class Module {
    /**
     * Class constructor.
     * @param {Object} config Module configuration
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
     * @param {Object} caches Cached system message data from loader
     */
    setup(caches) {
        this._caches = caches;
    }
    /**
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} message Message to check
     * @returns {Boolean|String|Array} Set(s) of expected properties
     */
    interested() {
        return false;
    }
    /**
     * Handles messages.
     * @param {Message} message Received message
     */
    execute(message) {
        if (message.type) {
            throw new Error('Implement this method!');
        }
    }
    /**
     * Cleans up the resources after a kill has been requested.
     * @param {Function} callback Callback to call after cleaning up
     * @returns {Number} Number of upcoming callback calls
     */
    kill(callback) {
        callback();
        return 1;
    }
    /**
     * Standard Redis callback.
     * @param {Error} error Error that occurred
     */
    _redisCallback(error) {
        if (error && this._logger) {
            this._logger.error('Redis error', error);
        }
    }
}

module.exports = Module;
