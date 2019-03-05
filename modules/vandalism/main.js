/**
 * main.js
 *
 * Main module for the possible vandalism detector.
 */
'use strict';

/**
 * Importing modules.
 */
const net = require('net'),
      Module = require('../module.js'),
      Format = require('../../formats/logger/main.js'),
      Discord = require('../../transports/discord/main.js'),
      Logger = require('../../include/log.js');

/**
 * Constants.
 */
const CACHE_EXPIRY = 3 * 60 * 60;

/**
 * Vandalism filter module.
 * @augments Module
 */
class Vandalism extends Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        if (config.summaries instanceof Array) {
            this._summaries = config.summaries.map(s => new RegExp(s, 'i'));
        } else {
            this._summaries = [];
        }
        this._wikiwl = config.wikiwl instanceof Array ? config.wikiwl : [];
        this._removal = typeof config.removal === 'number' ?
            config.removal :
            1500;
        const transport = config.transport || {};
        transport.type = 'discord-vandalism';
        this._transport = new Discord(transport);
        this._format = new Format({}, this._transport);
        this._logger = new Logger({
            file: true,
            name: 'vandalism',
            stdout: true
        });
    }
    /**
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} message Message to check
     * @returns {Boolean} Whether the module is interested in receiving
     */
    interested(message) {
        // Only return true if it's an edit,
        return message.type === 'edit' &&
            // the wiki isn't ignored
            !this._wikiwl.includes(message.wiki) &&
            // and vandalism conditions are satisfied:
            (
                // Summary matching.
                this._summaries.some(s => s.test(message.summary)) ||
                // Large removal/replacement/blanking by anons condition:
                net.isIP(message.user) &&
                (
                    // Page was blanked.
                    this._caches.i18n['autosumm-blank']
                        .includes(message.summary) ||
                    // Page was replaced.
                    this._caches.i18n['autosumm-replace']
                        .some(s => s.test(message.summary)) ||
                    // Large removal of content.
                    message.diff <= -this._removal
                )
            );
    }
    /**
     * Handles messages.
     * @param {Message} message Received message
     */
    execute(message) {
        const key = `vandalism:${message.user}:${message.language}:${message.wiki}:${message.domain}`;
        this._cache.exists(key, function(error, exists) {
            if (error) {
                this._logger.error('Redis error:', error);
            } else if (!exists) {
                this._cache
                    .batch()
                    .setbit(key, 0, 1)
                    .expire(key, CACHE_EXPIRY)
                    .exec(this._redisCallback.bind(this));
                const formatted = this._format.execute(message);
                if (
                    typeof formatted === 'object' &&
                    typeof formatted.content === 'string'
                ) {
                    let wiki = `${message.wiki}.${message.domain}`;
                    if (message.language && message.language !== 'en') {
                        wiki = `${wiki}/${message.language}`;
                    }
                    formatted.content = `[${wiki}] ${formatted.content}`;
                    this._transport.execute(formatted);
                }
            }
        }.bind(this));
    }
    /**
     * Cleans up the resources after a kill has been requested.
     * @param {Function} callback Callback to call after cleaning up
     * @returns {Number} Number of upcoming callback calls
     */
    kill(callback) {
        this._logger.close(callback);
        return 1;
    }
}

module.exports = Vandalism;
