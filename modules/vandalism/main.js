/**
 * main.js
 *
 * Main module for the vandalism module
 */
'use strict';

/**
 * Importing modules
 */
const Module = require('../module.js'),
      Cache = require('../../include/cache.js'),
      util = require('../../include/util.js'),
      Format = require('../../formats/logger/main.js'),
      Discord = require('../../transports/discord/main.js');

/**
 * Main vandalism filter class
 */
class Vandalism extends Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     */
    constructor(config) {
        super(config);
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
        this._cache = new Cache({
            check: 60000,
            debug: true,
            // 3 hours vandalism cooldown
            expiry: 3 * 60 * 60 * 1000,
            name: 'vandalism',
            save: 60000
        });
        this._cache.load();
    }
    /**
     * Handles messages
     * @param {Message} message Received message
     */
    execute(message) {
        const key = `${message.user}:${message.language}:${message.wiki}`;
        if (
            // If it's not an edit
            message.type !== 'edit' ||
            // or the wiki is ignored
            this._wikiwl.includes(message.wiki) ||
            // or the user is already reported
            this._cache.get(key) ||
            // or vandalism conditions aren't satisfied:
            !(
                // Summary matching
                this._summaries.some(s => s.test(message.summary)) ||
                // Large removal/replacement/blanking by anons condition:
                util.isIP(message.user) &&
                (
                    // Page was blanked
                    this._caches.i18n['autosumm-blank']
                        .includes(message.summary) ||
                    // Page was replaced
                    this._caches.i18n['autosumm-replace']
                        .some(s => s.test(message.summary)) ||
                    // Large removal of content
                    message.diff <= -this._removal
                )
            )
        ) {
            return;
        }
        this._cache.set(key, true);
        const formatted = this._format.execute(message);
        if (
            typeof formatted === 'object' &&
            typeof formatted.content === 'string'
        ) {
            formatted.content = `[${message.wiki}] ${formatted.content}`;
            this._transport.execute(formatted);
        }
    }
}

module.exports = Vandalism;
