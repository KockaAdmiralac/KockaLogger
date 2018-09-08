/**
 * main.js
 *
 * Main script for the debug module
 */
'use strict';

/**
 * Importing modules
 */
const Module = require('../module.js'),
      Logger = require('../../include/log.js');

/**
 * Debug module class
 */
class Debug extends Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     */
    constructor(config) {
        super(config);
        this._logger = new Logger({
            file: true,
            name: 'debug',
            stdout: true
        });
    }
    /**
     * Handles messages
     * @param {Message} message Message to handle
     */
    execute(message) {
        if (!message.parse()) {
            this._logger.error(message);
        }
    }
}

module.exports = Debug;
