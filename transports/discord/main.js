/**
 * main.js
 *
 * Main module for the Discord transport.
 */
'use strict';

/**
 * Importing modules.
 */
const Transport = require('../transport.js'),
      {WebhookClient} = require('discord.js');

/**
 * Discord transport class.
 * @augments Transport
 */
class Discord extends Transport {
    /**
     * Class constructor.
     * @param {Object} config Transport configuration
     */
    constructor(config) {
        super(config);
        this._webhook = new WebhookClient(config.id, config.token);
    }
    /**
     * Executes the transport.
     * @param {Object} message Formatted message to transport
     */
    async execute(message) {
        try {
            await this._webhook.send(message.content, message);
        } catch (error) {
            this._logger.error('Discord transport error:', error);
        }
    }
}

module.exports = Discord;
