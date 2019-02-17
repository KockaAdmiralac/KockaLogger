/**
 * error.js
 *
 * Module for storing parsing error data.
 */
'use strict';

/**
 * Importing modules.
 */
const Message = require('./msg.js');

/**
 * Message that failed to parse in early stages.
 * @augments Message
 */
class ErrorMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {String} raw Unparsed message from WikiaRC
     * @param {String} code Code of the error that occurred
     * @param {String} message Human readable error
     * @param {Object} details Additional details about the message
     */
    constructor(parser, raw, code, message, details) {
        super(parser, raw, 'error');
        this._error(code, message, details);
    }
}

module.exports = ErrorMessage;
