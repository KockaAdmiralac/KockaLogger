/**
 * transport.js
 *
 * Module required by all transports
 */
'use strict';

/**
 * Base transport class
 */
class Transport {
    /**
     * Class constructor
     * @param {Object} config Transport configuration
     */
    constructor(config) {
        this._config = config;
    }
    /**
     * Executes the transport
     * @param {Message} message Message to transport
     */
    execute(message) {
        if (message.type) {
            throw new Error('Implement this method!');
        }
    }
}

module.exports = Transport;
