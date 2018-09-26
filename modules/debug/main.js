/**
 * main.js
 *
 * Main script for the debug module
 */
'use strict';

/**
 * Importing modules
 */
const Module = require('../module.js'),
      Logger = require('../../include/log.js'),
      io = require('../../include/io.js');

/**
 * Debug module class
 */
class Debug extends Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        this._logger = new Logger({
            file: true,
            name: 'debug',
            stdout: true
        });
        this._fetched = {};
    }
    /**
     * Handles messages
     * @param {Message} message Message to handle
     */
    execute(message) {
        if (message.parse()) {
            return;
        }
        const key = `${message.language}:${message.wiki}`;
        // NOTE: This only works while logged out due to amlang
        if (!this._fetched[key]) {
            this._logger.debug('Message failed to parse', message);
            this._fetched[key] = true;
            io.query(message.wiki, message.language, {
                amcustomized: 'modified',
                ammessages: Object.keys(this._caches.i18n).join('|'),
                amprop: 'default',
                meta: 'allmessages'
            }).then(this._createCallback(message.wiki, message.language)).catch(
                e => this._logger.error('Error while fetching messages', e)
            );
        }
    }
    /**
     * Creates a callback function for handling message fetching responses
     * @param {String} wiki Wiki to handle the responses from
     * @param {String} language Language of the wiki
     * @returns {Function} Generated handler function
     * @private
     */
    _createCallback(wiki, language) {
        return function(data) {
            if (
                typeof data !== 'object' ||
                typeof data.query !== 'object' ||
                !(data.query.allmessages instanceof Array)
            ) {
                this._logger.error('Unusual MediaWiki API response', data);
            }
            const messages = {};
            data.query.allmessages.forEach(function(msg) {
                if (msg.default) {
                    messages[msg.name] = msg['*'];
                }
            });
            delete messages.mainpage;
            this._client.updateMessages(wiki, language, messages);
        }.bind(this);
    }
}

module.exports = Debug;
