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
      util = require('../../include/util.js'),
      {mainpage} = require('../../messages/messagecache.json');

/**
 * Importing modules
 */
const Discord = require('../../transports/discord/main.js');

/**
 * Constants
 */
const ZWS = String.fromCharCode(8203);

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
                    mainpage.includes(message.page)
                ) {
                    const name = message.target
                        .replace(/http:\/\//g, `http:/${ZWS}/`)
                        .replace(/https:\/\//g, `https:/${ZWS}/`)
                        .replace(/@/g, `@${ZWS}`)
                        .replace(/discord\.gg/g, `discord${ZWS}.${ZWS}gg`)
                        .replace(/_{1,2}([^_*]+)_{1,2}/g, '$1')
                        .replace(/\*{1,2}([^_*]+)\*{1,2}/g, '$1')
                        .replace(/\r?\n|\r/g, '​');
                    this._transport.execute({
                        content: `New wiki! [${name}](${util.url(message.wiki)})`
                    });
                }
            } else {
                this._logger.error('Cannot parse', message);
            }
        }
    }
}

module.exports = NewWikis;
