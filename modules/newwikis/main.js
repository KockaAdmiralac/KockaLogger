/**
 * main.js
 *
 * Main module for the logger module
 */
'use strict';

/**
 * Importing modules
 */
const Module = require('../module.js'),
      Logger = require('../../include/log.js'),
      util = require('../../include/util.js');

/**
 * Importing modules
 */
const Discord = require('../../transports/discord/main.js');

/**
 * Constants
 */
const QA_REGEX = /^([a-z-]*\.)?qatestwiki\d+$/;

/**
 * Main logger class
 */
class NewWikis extends Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     */
    constructor(config) {
        super(config);
        this._logger = new Logger({
            file: true,
            name: 'newwikis',
            stdout: true
        });
        config.type = 'discord-newwikis';
        this._transport = new Discord(config);
    }
    /**
     * Handles messages
     * @param {Message} message Received message
     */
    execute(message) {
        if (
            message.user === 'FANDOM' &&
            message.type === 'log' &&
            message.log === 'move' &&
            message.action === 'move'
        ) {
            if (message.parse()) {
                if (
                    message.reason === 'SEO' &&
                    this._caches.i18n.mainpage.includes(message.page) &&
                    !message.wiki.match(QA_REGEX)
                ) {
                    this._transport.execute({
                        content: `New wiki! [${util.escape(message.target)}](${util.url(message.wiki)})`
                    });
                }
            } else {
                this._logger.error('Cannot parse', message);
            }
        }
    }
}

module.exports = NewWikis;
