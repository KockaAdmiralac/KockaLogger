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
     */
    constructor(config) {
        this._config = config;
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
