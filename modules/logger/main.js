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
      io = require('../../include/io.js');

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
                    format: new Format(format, transport),
                    transport,
                    wiki: wiki.wiki
                });
            } catch (e) {
                console.log(e);
            }
        }, this);
    }
    /**
     * Fetches information about page that was edited
     * @param {Message} message Edit message
     * @param {Array<Object>} wikis Wiki handlers to sent the message to
     */
    _fetchPageInfo(message, wikis) {
        io.query(message.wiki, {
            revids: message.params.diff || message.params.oldid
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
            if (keys.length === 1) {
                const page = pages[keys[0]];
                if (typeof page.title === 'string') {
                    message.page = page.title;
                    this._execute(wikis, message);
                }
            }
        }.bind(this));
    }
    /**
     * Fetches information about closed/removed/deleted/restored threads
     * @param {Message} message Log message
     * @param {Array<Object>} wikis Wiki handlers to sent the message to
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
                this._execute(wikis, message);
            }
        }.bind(this));
    }
    /**
     * Handles messages
     * @param {Message} message Received message
     */
    execute(message) {
        const wikis = this._wikis.filter(w => w.wiki === message.wiki);
        if (!wikis.length) {
            return;
        }
        if (message.type === 'edit') {
            this._fetchPageInfo(message, wikis);
        } else if (message.type === 'log' && message.log === '0') {
            this._fetchThreadLogInfo(message, wikis);
        } else {
            this._execute(wikis, message);
        }
    }
    /**
     * Forwards messages to format and transport
     * @param {Array<Object>} wikis Wiki handlers to sent the message to
     * @param {Message} message Message to forward
     */
    _execute(wikis, message) {
        if (!message.parse()) {
            console.log('Logger format: cannot parse');
            return;
        }
        wikis.forEach(function(w) {
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
