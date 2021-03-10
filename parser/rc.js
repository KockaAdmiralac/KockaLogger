/**
 * rc.js
 *
 * Module for shared utilities between edit and log messages.
 */
'use strict';

/**
 * Importing modules.
 */
const Message = require('./msg.js');

/**
 * Parses messages received from the recent changes channel.
 * @augments Message
 */
class RCMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {String} raw Unparsed message from WikiaRC
     * @param {Array} res Regular expression execution result
     * @param {String} type Message type
     */
    constructor(parser, raw, res, type) {
        super(parser, raw, type);
        res.shift();
    }
}

module.exports = RCMessage;
