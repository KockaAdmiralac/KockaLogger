/**
 * main.js
 *
 * Main module for the logger module
 */
'use strict';

const Client = require('../../include/client.js');
const Message = require('../../parser/msg.js');
const Module = require('../module.js');
const Logging = require('../../include/log.js');
const Wiki = require('./wiki.js');

const INFO_THREADS = 10;

/**
 * Main logger class.
 * @augments Module
 */
class Logger extends Module {
    /**
     * Class constructor.
     * @param {object} config Module configuration
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
     * @param {object} caches Cached system message data from loader
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
                const {query} = response;
                const wikis = this._wikiMap.get(wiki.key)
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
     * @returns {boolean} Whether the module is interested in the message
     */
    interested(message) {
        const {type, language, wiki, domain, platform, flags} = message;
        const indices = this._wikiMap.get(`${language}.${wiki}.${domain}`);
        if (!(indices instanceof Array) || indices.length === 0) {
            return false;
        }
        if (type === 'discussions' && platform === 'article-comment') {
            return 'title';
        }
        return type !== 'edit' || !flags.includes('B');
    }
    /**
     * Handles messages.
     * @param {Message} message Received message
     */
    async execute(message) {
        const wikiKey = `${message.language}.${message.wiki}.${message.domain}`;
        const wikis = this._wikiMap.get(wikiKey)
            .map(index => this._wikis[index]);
        for (const wiki of wikis) {
            if (wiki && wiki.id) {
                try {
                    await wiki.execute(message);
                } catch (error) {
                    this._logger.error(
                        'Error while handling message',
                        error,
                        message.toJSON(),
                        wiki.key
                    );
                }
            }
        }
    }
    /**
     * Cleans up the resources after a kill has been requested.
     */
    kill() {
        this._logger.close();
        if (!this._wikis) {
            return;
        }
        for (const wiki of this._wikis) {
            wiki.kill();
        }
    }
}

module.exports = Logger;
