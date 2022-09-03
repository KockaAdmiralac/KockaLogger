/**
 * format.js
 *
 * Base module for all formats
 */
'use strict';

const Transport = require('../transports/transport.js');
const Message = require('../parser/msg.js');

/**
 * Base format class
 */
class Format {
    /**
     * Class constructor
     * @param {object} config Format configuration
     * @param {Transport} transport Transport used for the format
     */
    constructor(config, transport) {
        this._config = config || {};
        this._transport = transport;
    }
    /**
     * Formats the RC message
     * @param {Message} _message Message to be transported
     * @throws {Error} If not implemented
     */
    execute(_message) {
        throw new Error('Implement this method!');
    }
    /* eslint-disable no-empty-function */
    /**
     * Disposes resources used by the format so KockaLogger can cleanly exit.
     */
    kill() {}
    /* eslint-enable */
}

module.exports = Format;
