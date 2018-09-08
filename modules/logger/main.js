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
      io = require('../../include/io.js'),
      util = require('../../include/util.js'),
      Cache = require('../../include/cache.js'),
      Logging = require('../../include/log.js'),
      Wiki = require('./wiki.js');

/**
 * Constants
 */
const INFO_THREADS = 10,
      TITLE_REGEX = /<ac_metadata title="([^"]+)"[^>]*>\s*<\/ac_metadata>$/;

/**
 * Main logger class
 */
class Logger extends Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     */
    constructor(config) {
        super(config);
        if (!(config instanceof Array)) {
            throw new Error('Logger configuration invalid!');
        }
        this._initCache();
        this._initLogging();
        this._initWikis(config);
    }
    /**
     * Initializes cache
     * @private
     */
    _initCache() {
        this._cache = new Cache({
            check: 60000,
            expiry: 3 * 24 * 60 * 60 * 1000,
            name: 'logger',
            save: 60000
        });
        this._cache.load();
    }
    /**
     * Initializes the logger
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
     * Initializes wiki objects
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
     * Fetches information about a wiki that's in logging
     * @private
     */
    _fetchWikiInfo() {
        const key = this._fetching.shift();
        if (!key) {
            return;
        }
        const spl = key.split('.'),
              lang = spl.shift(),
              wiki = spl.join('.');
        io.query(wiki, lang, {
            meta: 'siteinfo',
            siprop: [
                'general',
                'namespaces',
                'statistics',
                'wikidesc'
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
     * Fetches information about page that was edited
     * @param {Message} message Edit message
     * @param {Array<Object>} wikis Wiki handlers to send the message to
     * @private
     */
    _fetchPageInfo(message, wikis) {
        const revids = message.params.diff || message.params.oldid;
        io.query(message.wiki, message.language, {revids}).then(function(d) {
            if (
                typeof d !== 'object' ||
                typeof d.query !== 'object' ||
                typeof d.query.pages !== 'object' ||
                typeof d.error === 'object'
            ) {
                return;
            }
            const {pages} = d.query,
                  keys = Object.keys(pages);
            if (keys.length === 1) {
                const page = pages[keys[0]];
                if (typeof page.title === 'string') {
                    message.page = page.title;
                    this._cache.set(`${message.wiki}-${revids}`, page.title);
                    this._handleTitle(wikis, message);
                }
            }
        }.bind(this)).catch(e => this._logger.error('Fetching page info', e));
    }
    /**
     * Fetches information about thread pages
     * @param {Array<Object>} wikis Wiki handlers to send the message to
     * @param {Message} message Thread message
     * @param {String} parent Parent thread title
     * @private
     */
    _fetchThreadInfo(wikis, message, parent) {
        io.query(message.wiki, message.language, {
            prop: 'revisions',
            rvprop: 'content',
            titles: parent
        }).then(function(d) {
            if (
                typeof d !== 'object' ||
                typeof d.query !== 'object' ||
                typeof d.query.pages !== 'object' ||
                typeof d.error === 'object'
            ) {
                return;
            }
            const {pages} = d.query,
                  keys = Object.keys(pages);
            if (keys.length === 0) {
                return;
            }
            const page = pages[keys[0]];
            if (
                !(page.revisions instanceof Array) ||
                page.revisions.length === 0
            ) {
                return;
            }
            const text = page.revisions[0]['*'],
                  res = TITLE_REGEX.exec(text);
            if (res) {
                message.threadid = Number(page.pageid);
                message.threadtitle = util.decodeHTML(res[1]);
                this._cache.set(`${message.language}-${message.wiki}-${parent}`, {
                    id: message.threadid,
                    title: message.threadtitle
                });
                this._execute(wikis, message);
            } else {
                this._logger.error('Failed to parse message title:', text);
            }
        }.bind(this)).catch(e => this._logger.error('Fetching thread info', e));
    }
    /**
     * Fetches information about closed/removed/deleted/restored threads
     * @param {Message} message Log message
     * @param {Array<Object>} wikis Wiki handlers to send the message to
     * @private
     */
    _fetchThreadLogInfo(message, wikis) {
        io.query(message.wiki, message.language, {
            list: 'recentchanges',
            rcprop: 'user|comment|title|loginfo',
            rctype: 'log'
        }).then(function(d) {
            if (
                typeof d !== 'object' ||
                typeof d.query !== 'object' ||
                !(d.query.recentchanges instanceof Array) ||
                typeof d.error === 'object'
            ) {
                return;
            }
            const rc = d.query.recentchanges.find(l => l.logtype === '0');
            if (rc) {
                message.log = 'thread';
                message.page = rc.title;
                message.user = rc.user;
                message.action = rc.logaction;
                message.namespace = rc.ns;
                message.reason = rc.comment;
                this._handleThreadTitle(wikis, message);
            }
        }.bind(this))
        .catch(e => this._logger.error('Fetch thread log info', e));
    }
    /**
     * Handles messages
     * @param {Message} message Received message
     */
    execute(message) {
        const indexes = this._wikiMap[`${message.language}.${message.wiki}`];
        if (
            !(indexes instanceof Array) ||
            !indexes.length
        ) {
            return;
        }
        const wikis = [];
        indexes.forEach(function(index) {
            if (this._wikis[index] && this._wikis[index].id) {
                wikis.push(this._wikis[index]);
            }
        }, this);
        if (message.type === 'edit' && !message.flags.includes('B')) {
            if (message.params.diff) {
                const key = `${message.language}-${message.wiki}-${message.params.oldid}`,
                      title = this._cache.get(key);
                if (title) {
                    message.page = title;
                    this._cache.delete(key);
                    this._cache.set(
                        `${message.language}-${message.wiki}-${message.params.diff}`,
                        title
                    );
                    this._handleTitle(wikis, message);
                } else {
                    this._fetchPageInfo(message, wikis);
                }
            } else {
                this._fetchPageInfo(message, wikis);
            }
        } else if (message.type === 'log' && message.log === '0') {
            this._fetchThreadLogInfo(message, wikis);
        } else if (message.type !== 'edit') {
            this._execute(wikis, message);
        }
    }
    /**
     * Handles transport of a message after the title has been obtained
     * @param {Array<Object>} wikis Wikis the message is from
     * @param {Message} message Message to transport
     * @private
     */
    _handleTitle(wikis, message) {
        const ns = wikis[0].getNamespaceID(message.page.split(':')[0]);
        message.namespace = ns;
        if (ns === 1201 || ns === 2001) {
            this._handleThreadTitle(wikis, message);
        } else {
            this._execute(wikis, message);
        }
    }
    /**
     * Handles transport of a message related to a thread after its
     * title has been obtained
     * @param {Array<Object>} wikis Wikis the message is from
     * @param {Message} message Message to transport
     */
    _handleThreadTitle(wikis, message) {
        const parent = message.page.split('/').slice(0, 2).join('/'),
        data = this._cache.get(`${message.language}-${message.wiki}-${parent}`);
        message.isMain = parent === message.page;
        if (data) {
            message.threadtitle = data.title;
            message.threadid = data.id;
            this._execute(wikis, message);
        } else {
            this._fetchThreadInfo(wikis, message, parent);
        }
    }
    /**
     * Forwards messages to format and transport
     * @param {Array<Object>} wikis Wiki handlers to sent the message to
     * @param {Message} message Message to forward
     * @private
     */
    _execute(wikis, message) {
        if (!message.parse()) {
            this._logger.error('Logger format: cannot parse:', message);
            return;
        }
        wikis.forEach(function(w) {
            try {
                w.execute(message);
            } catch (e) {
                this._logger.error(
                    'Error while handling message',
                    e,
                    message,
                    w.name
                );
            }
        }, this);
    }
}

module.exports = Logger;
