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
        this._initLogging();
        this._initWikis(config);
    }
    /**
     * Initializes the logger.
     * @private
     */
    _initLogging() {
        this._logger = new Logging({
            file: true,
            name: 'logger',
            stdout: true
        });
    }
    /**
     * Initializes wiki objects.
     * @param {Array<Object>} config Configuration array
     * @private
     */
    _initWikis(config) {
        this._wikis = config
            .map(wiki => new Wiki(wiki))
            .filter(wiki => wiki.initialized);
        this._wikiMap = {};
        this._intervals = {};
        this._fetching = [];
        this._wikis.forEach(function(wiki, i) {
            if (this._wikiMap[wiki.key]) {
                this._wikiMap[wiki.key].push(i);
            } else {
                this._wikiMap[wiki.key] = [i];
                this._fetching.push(wiki.key);
            }
        }, this);
        for (
            let i = 0, l = this._fetching.length;
            i < l && i < INFO_THREADS;
            ++i
        ) {
            this._fetchWikiInfo();
        }
    }
    /**
     * Fetches information about a wiki that's in logging.
     * @private
     */
    _fetchWikiInfo() {
        const key = this._fetching.shift();
        if (!key) {
            return;
        }
        const spl = key.split('.'),
              lang = spl.shift(),
              domain = spl.splice(-2).join('.'),
              wiki = spl.join('.');
        this._io.query(wiki, lang, domain, {
            meta: 'siteinfo',
            siprop: [
                'general',
                'namespaces',
                'statistics',
                'wikidesc',
                'variables'
            ].join('|')
        }).then(function(d) {
            if (
                typeof d === 'object' &&
                typeof d.query === 'object' &&
                typeof d.error !== 'object'
            ) {
                const {query} = d;
                this._wikiMap[key].forEach(function(index) {
                    this._wikis[index].setData(query);
                }, this);
            }
            this._fetchWikiInfo();
        }.bind(this)).catch(e => this._logger.error('Fetching wiki info', e));
    }
    /**
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} message Message to check
     * @returns {Boolean|String|Array} Set(s) of expected properties
     */
    interested(message) {
        const indexes = this._wikiMap[
            `${message.language}.${message.wiki}.${message.domain}`
        ];
        if (!(indexes instanceof Array) || indexes.length === 0) {
            return false;
        }
        if (message.type === 'edit' && !message.flags.includes('B')) {
            const ns = this._wikis[indexes[0]]
                .getNamespaceID(message.page.split(':')[0]);
            if (ns === 1200 || ns === 2000) {
                return ['threadinfo', 'pageinfo'];
            }
            return 'pageinfo';
        } else if (message.type === 'log' && message.log === '0') {
            return 'threadlog';
        } else if (message.type !== 'edit') {
            return true;
        }
        return false;
    }
    /**
     * Handles messages.
     * @param {Message} message Received message
     */
    execute(message) {
        this._wikiMap[
            `${message.language}.${message.wiki}.${message.domain}`
        ].forEach(function(index) {
            const wiki = this._wikis[index];
            if (wiki && wiki.id) {
                try {
                    wiki.execute(message);
                } catch (e) {
                    this._logger.error(
                        'Error while handling message',
                        e,
                        message,
                        wiki.key
                    );
                }
            }
        }, this);
    }
    /**
     * Cleans up the resources after a kill has been requested.
     * @param {Function} callback Callback to call after cleaning up
     * @returns {Number} Number of upcoming callback calls
     */
    kill(callback) {
        this._logger.close(callback);
        this._wikis.forEach(wiki => wiki.kill(callback));
        return this._wikis.length + 1;
    }
}

module.exports = Logger;
