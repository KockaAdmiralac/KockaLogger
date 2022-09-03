/**
 * transport.js
 *
 * Module required by all transports
 */
'use strict';

const Logger = require('../include/log.js');
const Message = require('../parser/msg.js');

/**
 * Base transport class
 */
class Transport {
    /**
     * Class constructor
     * @param {object} config Transport configuration
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
     * @param {Message} _message Message to transport
     * @throws {Error} If not implemented
     */
    execute(_message) {
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
