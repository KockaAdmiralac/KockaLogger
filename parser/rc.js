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
    /**
     * Trims the unnecessary character off the summary
     * @param {String} summary Summary to trim
     * @returns {String} Trimmed summary
     * @protected
     */
    _trimSummary(summary) {
        if (summary.endsWith('\x03')) {
            return summary.slice(0, -1);
        }
        return summary;
    }
}

module.exports = RCMessage;
