/**
 * main.js
 *
 * Main module for the new wikis transport.
 */
'use strict';

/**
 * Importing modules.
 */
const Module = require('../module.js'),
      {escape, url} = require('../../include/util.js'),
      Discord = require('../../transports/discord/main.js');

/**
 * Constants.
 */
const QA_REGEX = /^([a-z-]*\.)?qatestwiki\d+$/;

/**
 * New wiki transport module.
 * @augments Module
 */
class NewWikis extends Module {
    /**
     * Class constructor.
     * @param {Object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        config.type = 'discord-newwikis';
        this._transport = new Discord(config);
    }
    /**
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} message Message to check
     * @returns {Boolean} Whether the module is interested in receiving
     */
    interested(message) {
        return message.user === 'FANDOM' &&
               message.type === 'log' &&
               message.log === 'move' &&
               message.action === 'move' &&
               message.reason === 'SEO' &&
               this._caches.i18n.mainpage.includes(message.page) &&
               !message.wiki.match(QA_REGEX);
    }
    /**
     * Handles messages.
     * @param {Message} message Received message
     */
    execute(message) {
        const {target, wiki, language, domain} = message;
        this._transport.execute({
            content: `New wiki! [${escape(target).replace(/\[|\]/g, '')}](<${url(wiki, language, domain)}>)`
        });
    }
}

module.exports = NewWikis;
