/**
 * error.js
 *
 * Module for storing parsing error data.
 */
'use strict';

const Message = require('./msg.js');
const Parser = require('./parser.js');

/**
 * Message that failed to parse in early stages.
 * @augments Message
 */
class ErrorMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {string} raw Unparsed message from WikiaRC
     * @param {string} code Code of the error that occurred
     * @param {string} message Human readable error
     * @param {object} details Additional details about the message
     */
    constructor(parser, raw, code, message, details) {
        super(parser, raw, 'error');
        this._error(code, message, details);
    }
}

module.exports = ErrorMessage;
