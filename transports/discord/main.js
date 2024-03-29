/**
 * main.js
 *
 * Main module for the Discord transport.
 */
'use strict';

const Transport = require('../transport.js');
const {WebhookClient} = require('discord.js');

/**
 * Discord transport class.
 * @augments Transport
 */
class Discord extends Transport {
    /**
     * Class constructor.
     * @param {object} config Transport configuration
     */
    constructor(config) {
        super(config);
        this._webhook = new WebhookClient({
            id: config.id,
            token: config.token
        }, {
            allowedMentions: {
                parse: ['users']
            }
        });
    }
    /**
     * Executes the transport.
     * @param {object} message Formatted message to transport
     */
    async execute(message) {
        try {
            await this._webhook.send(message);
        } catch (error) {
            this._logger.error('Discord transport error:', error);
        }
    }
    /**
     * Disposes resources used by the transport so KockaLogger can cleanly exit.
     */
    kill() {
        this._webhook.destroy();
    }
}

module.exports = Discord;
