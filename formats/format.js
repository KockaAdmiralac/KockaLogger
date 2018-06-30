/**
 * format.js
 *
 * Base module for all formats
 */
'use strict';

/**
 * Base format class
 */
class Format {
    /**
     * Class constructor
     * @param {Object} config Format configuration
     * @param {Transport} transport Transport used for the format
     */
    constructor(config, transport) {
        this._config = config || {};
        this._transport = transport;
    }
    /**
     * Formats the RC message
     * @param {Message} message Message to be transported
     */
    execute(message) {
        if (message.type) {
            throw new Error('Implement this method!');
        }
    }
}

module.exports = Format;
