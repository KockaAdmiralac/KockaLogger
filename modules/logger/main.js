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
      Cache = require('../../include/cache.js');

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
        this._wikis = [];
        this._cache = new Cache({
            check: 60000,
            expiry: 3 * 24 * 60 * 60 * 1000,
            name: 'logger',
            save: 60000
        });
        this._cache.load();
        this._fetching = [];
        config.forEach(function(wiki) {
            if (
                typeof wiki !== 'object' ||
                typeof wiki.wiki !== 'string' ||
                typeof wiki.transport !== 'object'
            ) {
                return;
            }
            const format = wiki.format || {};
            try {
                const Transport = require(`../../transports/${wiki.transport.name || 'discord'}/main.js`),
                      Format = require(`../../formats/${format.name || 'logger'}/main.js`);
                const transport = new Transport(wiki.transport);
                this._wikis.push({
                    bots: wiki.bots || ['FANDOM', 'FANDOMbot'],
                    format: new Format(format, transport),
                    transport,
                    wiki: wiki.wiki
                });
                if (!this._fetching.includes(wiki.wiki)) {
                    this._fetching.push(wiki.wiki);
                }
            } catch (e) {
                console.log(e);
            }
        }, this);
        for (let i = 0; i < this._fetching.length && i < INFO_THREADS; ++i) {
            this._fetchWikiInfo();
        }
    }
    /**
     * Fetches information about a wiki that's in logging
     * @private
     */
    _fetchWikiInfo() {
        const wiki = this._fetching.shift();
        if (!wiki) {
            return;
        }
        io.query(wiki, {
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
                this._wikis.filter(w => w.wiki === wiki).forEach(function(w) {
                    w.id = Number(query.wikidesc.id);
                    w.sitename = query.general.sitename;
                    w.path = query.general.articlepath;
                    w.namespaces = {};
                    for (const i in query.namespaces) {
                        const ns = query.namespaces[i];
                        w.namespaces[ns['*']] = ns.id;
                        w.namespaces[ns.canonical] = ns.id;
                    }
                    w.statistics = query.statistics;
                }, this);
            }
            this._fetchWikiInfo();
        }.bind(this)).catch(e => console.log(e));
    }
    /**
     * Fetches information about page that was edited
     * @param {Message} message Edit message
     * @param {Array<Object>} wikis Wiki handlers to sent the message to
     * @private
     */
    _fetchPageInfo(message, wikis) {
        const revids = message.params.diff || message.params.oldid;
        io.query(message.wiki, {revids}).then(function(d) {
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
        }.bind(this)).catch(e => console.log(e));
    }
    /**
     * Fetches information about thread pages
     * @param {Array<Object>} wikis Wiki handlers to send the message to
     * @param {Message} message Thread message
     * @param {String} parent Parent thread title
     * @private
     */
    _fetchThreadInfo(wikis, message, parent) {
        io.query(message.wiki, {
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
                this._cache.set(`${message.wiki}-${parent}`, {
                    id: message.threadid,
                    title: message.threadtitle
                });
                this._execute(wikis, message);
            } else {
                console.log(`Failed to parse message title: ${text}`);
            }
        }.bind(this)).catch(e => console.log(e));
    }
    /**
     * Fetches information about closed/removed/deleted/restored threads
     * @param {Message} message Log message
     * @param {Array<Object>} wikis Wiki handlers to send the message to
     * @private
     */
    _fetchThreadLogInfo(message, wikis) {
        io.query(message.wiki, {
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
        }.bind(this));
    }
    /**
     * Handles messages
     * @param {Message} message Received message
     */
    execute(message) {
        const wikis = this._wikis.filter(w => w.wiki === message.wiki);
        if (!wikis.length || wikis.some(w => !w.id)) {
            return;
        }
        if (message.type === 'edit' && !message.flags.includes('B')) {
            if (message.params.diff) {
                const key = `${message.wiki}-${message.params.oldid}`,
                      title = this._cache.get(key);
                if (title) {
                    message.page = title;
                    this._cache.delete(key);
                    this._cache.set(
                        `${message.wiki}-${message.params.diff}`,
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
        } else {
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
        const ns = wikis[0].namespaces[message.page.split(':')[0]];
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
        data = this._cache.get(`${message.wiki}-${parent}`);
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
            console.log('Logger format: cannot parse');
            return;
        }
        wikis.forEach(function(w) {
            if (w.bots.includes(message.user)) {
                return;
            }
            try {
                const formatted = w.format.execute(message);
                if (formatted) {
                    w.transport.execute(formatted);
                }
            } catch (e) {
                console.log(e);
            }
        }, this);
    }
}

module.exports = Logger;
