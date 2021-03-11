/**
 * main.js
 *
 * Main module for the possible vandalism detector.
 */
'use strict';

/**
 * Importing modules.
 */
const {isIP} = require('net'),
      Module = require('../module.js'),
      Format = require('../../formats/logger/main.js'),
      Discord = require('../../transports/discord/main.js'),
      Logger = require('../../include/log.js'),
      {shorturl} = require('../../include/util.js');

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
        const {summaries, wikiwl, removal, transport} = config;
        this._summaries = summaries instanceof Array ?
            summaries.map(s => new RegExp(s, 'i')) :
            [];
        this._wikiwl = wikiwl instanceof Array ? wikiwl : [];
        this._removal = typeof removal === 'number' ? removal : 1500;
        this._transport = new Discord({
            ...transport,
            type: 'discord-vandalism'
        });
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
                isIP(message.user) &&
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
    async execute(message) {
        const {user, wiki, language, domain} = message,
              key = `vandalism:${user}:${language}:${wiki}:${domain}`;
        try {
            if (await this._cache.exists(key)) {
                return;
            }
            await this._cache
                .multi()
                .setbit(key, 0, 1)
                .expire(key, CACHE_EXPIRY)
                .exec();
            const formatted = this._format.execute(message);
            if (
                typeof formatted === 'object' &&
                typeof formatted.content === 'string'
            ) {
                formatted.content = `[${shorturl(wiki, language, domain)}] ${formatted.content}`;
                await this._transport.execute(formatted);
            }
        } catch (error) {
            this._logger.error('Redis error', error);
        }
    }
    /**
     * Cleans up the resources after a kill has been requested.
     */
    kill() {
        this._logger.close();
        this._transport.kill();
        this._format.kill();
    }
}

module.exports = Vandalism;
