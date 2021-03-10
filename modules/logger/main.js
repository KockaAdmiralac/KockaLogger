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
      Logging = require('../../include/log.js'),
      Wiki = require('./wiki.js');

/**
 * Constants
 */
const INFO_THREADS = 10;

/**
 * Main logger class.
 * @augments Module
 */
class Logger extends Module {
    /**
     * Class constructor.
     * @param {Object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        if (!(config instanceof Array)) {
            throw new Error('Logger configuration invalid!');
        }
        this._logger = new Logging({
            file: true,
            name: 'logger',
            stdout: true
        });
    }
    /**
     * Initializes wiki objects.
     * @param {Object} caches Cached system message data from loader
     */
    async setup(caches) {
        super.setup(caches);
        this._wikis = this._config
            .map(wiki => new Wiki(wiki))
            .filter(wiki => wiki.initialized);
        this._wikiMap = new Map();
        const fetching = [];
        for (let i = 0, l = this._wikis.length; i < l; ++i) {
            const wiki = this._wikis[i];
            if (this._wikiMap.has(wiki.key)) {
                this._wikiMap.get(wiki.key).push(i);
            } else {
                this._wikiMap.set(wiki.key, [i]);
                fetching.push(wiki);
            }
        }
        while (fetching.length > 0) {
            await Promise.all(
                fetching
                    .splice(0, INFO_THREADS)
                    .map(wiki => this._fetchWikiInfo(wiki))
            );
        }
    }
    /**
     * Fetches information about a wiki that's being logged.
     * @param {Wiki} wiki Wiki whose information is to be fetched
     * @private
     */
    async _fetchWikiInfo(wiki) {
        const {name, language, domain} = wiki;
        try {
            const response = await this._io.query(name, language, domain, {
                meta: 'siteinfo',
                siprop: [
                    'general',
                    'namespaces',
                    'variables'
                ].join('|')
            });
            if (
                typeof response === 'object' &&
                typeof response.query === 'object' &&
                typeof response.error !== 'object'
            ) {
                const {query} = response,
                      wikis = this._wikiMap.get(wiki.key)
                          .map(index => this._wikis[index]);
                for (const dataWiki of wikis) {
                    dataWiki.setData(query);
                }
            } else {
                this._logger.error('Invalid siteinfo response', response);
            }
        } catch (error) {
            this._logger.error('Fetching wiki info', error);
        }
    }
    /**
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} message Message to check
     * @returns {Boolean} Whether the module is interested in the message
     */
    interested(message) {
        const indexes = this._wikiMap.get(
            `${message.language}.${message.wiki}.${message.domain}`
        );
        if (!(indexes instanceof Array) || indexes.length === 0) {
            return false;
        }
        return message.type !== 'edit' || !message.flags.includes('B');
    }
    /**
     * Handles messages.
     * @param {Message} message Received message
     */
    async execute(message) {
        const wikiKey = `${message.language}.${message.wiki}.${message.domain}`,
              wikis = this._wikiMap.get(wikiKey)
                  .map(index => this._wikis[index]);
        for (const wiki of wikis) {
            if (wiki && wiki.id) {
                try {
                    await wiki.execute(message);
                } catch (error) {
                    this._logger.error(
                        'Error while handling message',
                        error,
                        message,
                        wiki.key
                    );
                }
            }
        }
    }
    /**
     * Cleans up the resources after a kill has been requested.
     * @param {Function} callback Callback to call after cleaning up
     * @returns {Number} Number of upcoming callback calls
     */
    kill(callback) {
        this._logger.close(callback);
        if (!this._wikis) {
            return 1;
        }
        this._wikis.forEach(wiki => wiki.kill(callback));
        return this._wikis.length + 1;
    }
}

module.exports = Logger;
