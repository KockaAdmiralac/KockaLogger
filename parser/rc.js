/**
 * rc.js
 *
 * Module for shared utilities between edit and log messages.
 */
'use strict';

const Message = require('./msg.js');
const Parser = require('./parser.js');

/**
 * Parses messages received from the recent changes channel.
 * @augments Message
 */
class RCMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {string} raw Unparsed message from WikiaRC
     * @param {Array} res Regular expression execution result
     * @param {string} type Message type
     */
    constructor(parser, raw, res, type) {
        super(parser, raw, type);
        res.shift();
    }
    /**
     * Trims the unnecessary character off the summary.
     * @param {string} summary Summary to trim
     * @returns {string} Trimmed summary
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
