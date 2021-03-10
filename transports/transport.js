/**
 * transport.js
 *
 * Module required by all transports
 */
'use strict';

/**
 * Importing modules
 */
const Logger = require('../include/log.js');

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
        this._logger = new Logger({
            file: true,
            name: `${config.type}-transport`
        });
    }
    /**
     * Executes the transport
     * @param {Message} message Message to transport
     */
    execute() {
        throw new Error('Implement this method!');
    }
    /* eslint-disable no-empty-function */
    /**
     * Disposes resources used by the transport so KockaLogger can cleanly exit.
     */
    kill() {}
    /* eslint-enable */
}

module.exports = Transport;
