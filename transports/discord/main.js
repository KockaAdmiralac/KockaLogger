/**
 * main.js
 *
 * Main module for the Discord transport
 */
'use strict';

/**
 * Importing modules
 */
const Transport = require('../transport.js'),
      io = require('../../include/io.js');

/**
 * Discord transport class
 */
class Discord extends Transport {
    /**
     * Class constructor
     * @param {Object} config Transport configuration
     */
    constructor(config) {
        super(config);
        this._url = `https://discordapp.com/api/webhooks/${config.id}/${config.token}`;
    }
    /**
     * Executes the transport
     * @param {Object} message Formatted message to transport
     */
    execute(message) {
        io.webhook(this._url, message);
    }
}

module.exports = Discord;
