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
      IO = require('../../include/io.js'),
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
        /*
        this._url = `https://discordapp.com/api/webhooks/${config.id}/${config.token}`;
        this._queue = [];
        this._io = new IO();
        */
    }
    /**
     * Executes the transport.
     * @param {Object} message Formatted message to transport
     */
    execute(message) {
        /*
        if (this._ratelimit) {
            this._queue.push(message);
        } else {
            this._io.webhook(this._url, message).catch(function(e) {
                if (e.statusCode === 429) {
                    this._ratelimit = true;
                    this._queue.push(message);
                    if (!this._timer) {
                        this._timer = setTimeout(
                            this._timeout.bind(this),
                            e.error.retry_after
                        );
                    }
                } else {
                    this._logger.error('Error:', e);
                }
            }.bind(this));
        }
        */
        this._webhook.send(message.content, message);
    }
    /**
     * Executed after Discord's wait time finishes.
     * @private
     */
    _timeout() {
        try {
            this._timer = false;
            this._ratelimit = false;
            this._queue.splice(0).forEach(this.execute, this);
        } catch (e) {
            this._logger.error('Error in timeout:', e);
        }
    }
}

module.exports = Discord;
