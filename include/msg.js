/**
 * msg.js
 *
 * Where all message parsing magic happens
 */
'use strict';

/**
 * Importing modules
 */
const i18n = require('../messages/i18n.json'),
      custom = require('../messages/i18n2.json'),
      original = require('../messages/messagecache.json'),
      customOriginal = require('../messages/custom.json'),
      util = require('./util.js');

/**
 * Constants
 */
const REGEXES = {
    edit: /^\x0314\[\[\x0307([^\]]+)\x0314\]\]\x034 ([!NBM]*)\x0310 \x0302https?:\/\/([a-z0-9-.]+)\.(?:wikia|fandom)\.com\/(?:([a-z-]+)\/)?index\.php\?(\S+)\x03 \x035\*\x03 \x0303([^\x03]+)\x03 \x035\*\x03 \(\x02?(\+|-)(\d+)\x02?\) \x0310(.*)$/,
    log: /^\x0314\[\[\x0307[^:]+:Log\/([^\x03]+)\x0314\]\]\x034 ([^\x03]+)\x0310 \x0302https?:\/\/([a-z0-9-.]+)\.(?:wikia|fandom)\.com\/(?:([a-z-]+)\/)?wiki\/[^:]+:Log\/[^\x03]+\x03 \x035\*\x03 \x0303([^\x03]+)\x03 \x035\*\x03\s{2}\x0310(.*)$/
}, AF_REGEX = /https?:\/\/[a-z0-9-.]+\.(?:wikia|fandom)\.com\/(?:[a-z-]+\/)?wiki\/[^:]+:AbuseFilter\/(\d+) \(https?:\/\/[a-z0-9-.]+\.(?:wikia|fandom)\.com\/(?:[a-z-]+\/)?wiki\/[^:]+:AbuseFilter\/history\/\d+\/diff\/prev\/(\d+)\)$/,
BLOCK_FLAGS = [
    'angry-autoblock',
    'anononly',
    'hiddenname',
    'noautoblock',
    'noemail',
    'nousertalk'
], MESSAGES = [
    'blocklogentry',
    'unblocklogentry',
    'reblock-logentry',
    'protectedarticle',
    'modifiedarticleprotection',
    'unprotectedarticle',
    'movedarticleprotection',
    'rightslogentry',
    'deletedarticle',
    'undeletedarticle',
    'logentry-delete-event-legacy',
    'logentry-delete-revision-legacy',
    'uploadedimage',
    'overwroteimage',
    '1movedto2',
    '1movedto2_redir',
    'blog-avatar-removed-log',
    'patrol-log-line',
    'chat-chatbanadd-log-entry',
    'chat-chatbanchange-log-entry',
    'chat-chatbanremove-log-entry'
], MESSAGE_MAP = {
    block: {
        block: 'blocklogentry',
        reblock: 'reblock-logentry',
        unblock: 'unblocklogentry'
    },
    chatban: {
        chatbanadd: 'chat-chatbanadd-log-entry',
        chatbanchange: 'chat-chatbanchange-log-entry',
        chatbanremove: 'chat-chatbanremove-log-entry'
    },
    delete: {
        delete: 'deletedarticle',
        restore: 'undeletedarticle'
    },
    move: {
        move: '1movedto2',
        // eslint-disable-next-line
        move_redir: '1movedto2_redir'
    },
    patrol: {
        patrol: 'patrol-log-line'
    },
    protect: {
        modify: 'modifiedarticleprotection',
        // eslint-disable-next-line
        move_prot: 'movedarticleprotection',
        protect: 'protectedarticle',
        unprotect: 'unprotectedarticle'
    },
    rights: {
        rights: 'rightslogentry'
    },
    upload: {
        overwrite: 'overwroteimage',
        revert: 'uploadedimage',
        upload: 'uploadedimage'
    },
    useravatar: {
        // eslint-disable-next-line
        avatar_rem: 'blog-avatar-removed-log'
    }
}, NEWUSERS_REGEX = /^(.+) New user registration https?:\/\/([a-z0-9-.]+)\.(?:wikia|fandom)\.com\/(?:([a-z-]+)\/)?wiki\/Special:Log\/newusers$/,
DISCUSSIONS_URL_REGEX = /^https?:\/\/([a-z0-9-.]+)\.(?:wikia|fandom)\.com\/(?:([a-z-]+)\/)?d\/p\/(\d{19,})(?:\/r\/(\d{19,}))?$/,
DISCUSSIONS_TYPE_REGEX = /^discussion-(thread|post|report)$/,
WIKIFEATURES_REGEX = /^wikifeatures\s?: set extension option: ([^=]+) = (true|false)$/;

/**
 * Represents an RC message
 */
class Message {
    /**
     * Class constructor
     * @param {String} raw IRC message contents
     * @param {String} type Message channel type
     */
    constructor(raw, type) {
        this.raw = raw;
        this.type = false;
        this[`_${type}Message`](raw);
    }
    /**
     * Turns i18n data into regular expressions in advance
     * @todo Is the return condition thread-safe?
     */
    static prepare() {
        // Already prepared
        if (i18n[MESSAGES[0]][0] instanceof RegExp) {
            return;
        }
        MESSAGES.forEach(function(m) {
            i18n[m] = i18n[m].map(msg => new RegExp(msg));
        });
        for (const wiki in custom) {
            for (const msg in custom[wiki]) {
                custom[wiki][msg] = new RegExp(custom[wiki][msg]);
            }
        }
        BLOCK_FLAGS.forEach(function(m) {
            i18n[`block-log-flags-${m}`] = new RegExp(
                i18n[`block-log-flags-${m}`]
                    .map(util.escapeRegex)
                    .join('|')
            );
        });
    }
    /**
     * Handles RC IRC messages
     * @param {String} raw Raw IRC message
     * @private
     */
    _rcMessage(raw) {
        this.parsed = false;
        for (const i in REGEXES) {
            const res = REGEXES[i].exec(raw);
            if (res) {
                this.type = i;
                res.shift();
                this[`_${i}`](res);
                break;
            }
        }
    }
    /**
     * Handles Discussions IRC messages
     * @param {String} raw Raw IRC message
     * @private
     */
    _discussionsMessage(raw) {
        try {
            const msg = JSON.parse(raw),
                  res = DISCUSSIONS_URL_REGEX.exec(msg.url),
                  res2 = DISCUSSIONS_TYPE_REGEX.exec(msg.type);
            if (res && res2) {
                this.type = 'discussions';
                this.parsed = true;
                this.wiki = res[1];
                this.language = res[2] || 'en';
                this.thread = res[3];
                this.reply = res[4];
                this.dtype = res2[1];
                this.snippet = msg.snippet;
                this.title = msg.title;
                this.size = msg.size;
                this.category = msg.category;
                this.url = msg.url;
                // TODO: Remove when FANDOM releases HTTPS globally
                if (!this.wiki.includes('.')) {
                    this.url = this.url.replace(/^http:/, 'https:');
                }
                this.user = msg.userName;
                this.action = msg.action;
            }
        } catch (e) {
            console.log(e);
        }
    }
    /**
     * Handles new users IRC messages
     * @param {String} raw Raw IRC message
     * @private
     */
    _newusersMessage(raw) {
        const res = NEWUSERS_REGEX.exec(raw);
        if (res) {
            this.type = 'log';
            this.log = 'newusers';
            this.action = 'newusers';
            this.parsed = true;
            this.user = res[1];
            this.wiki = res[2];
            this.language = res[3] || 'en';
        }
    }
    /**
     * Handles edit-related messages
     * @param {Array<String>} res Regular expression execution results
     * @private
     */
    _edit(res) {
        this.parsed = true;
        this.page = res.shift();
        this.flags = res.shift().split('');
        this.wiki = res.shift();
        this.language = res.shift() || 'en';
        this.params = {};
        res.shift().split('&').forEach(function(p) {
            const spl = p.split('=');
            this.params[spl[0]] = Number(spl[1]);
        }, this);
        this.user = res.shift();
        const sign = res.shift(),
              num = Number(res.shift());
        this.diff = sign === '-' ? -num : num;
        this.summary = this._trimSummary(res.shift());
    }
    /**
     * Handles log-related messages
     * @param {Array<String>} res Regular expression execution results
     * @private
     */
    _log(res) {
        this.log = res.shift();
        this.action = res.shift();
        this.wiki = res.shift();
        this.language = res.shift() || 'en';
        this.user = res.shift();
        if (this.log === 'useravatar' && this.action === 'avatar_chn') {
            this.parsed = true;
        }
        this._summary = this._trimSummary(res.shift());
    }
    /**
     * Trims the unnecessary character off the summary
     * @param {String} summary Summary to trim
     * @returns {String} Trimmed summary
     * @private
     */
    _trimSummary(summary) {
        if (summary.endsWith('\x03')) {
            return summary.slice(0, -1);
        }
        return summary;
    }
    /* eslint-disable max-statements */
    /**
     * Extracts useful information from log summaries
     * THIS IS POTENTIALLY EXPENSIVE!
     * @returns {Boolean} If parsing has been successful
     * @todo Shorten this or something
     */
    parse() {
        /**
         * If calling again, message failed to parse at earlier stage,
         * or is unparsable, return before parsing
         */
        if (this.parsed || !this._summary) {
            return Boolean(this.type);
        }
        // If there's a handler for this action, attempt to handle it
        if (typeof this[`_${this.log}`] === 'function') {
            let res = null;
            if (MESSAGE_MAP[this.log]) {
                // Article comments suck
                if (this.action === 'article_comment') {
                    this.action = 'delete';
                    res = this._i18n();
                    if (!res) {
                        this.action = 'restore';
                        res = this._i18n();
                    }
                } else {
                    res = this._i18n();
                }
                if (!res) {
                    return false;
                }
            }
            if (this[`_${this.log}`](res) !== false) {
                this.parsed = true;
                delete this._summary;
                return true;
            }
        }
        // We've encountered an unexpected action
        this.summary = this._summary;
        delete this._summary;
        return false;
    }
    /* eslint-enable max-statements */
    /**
     * Attempts to parse the summary based on regular expressions
     * generated from i18n MediaWiki messages
     * @param {String} msg Message to get the summary from
     * @param {String} summary Summary to attempt parsing on
     * @returns {Array<String>|null} Parsing results if successful
     */
    _i18n() {
        const msg = MESSAGE_MAP[this.log][this.action];
        if (!msg) {
            return null;
        }
        // May be expensive
        const clone = i18n[msg].slice(0),
              originalClone = original[msg].slice(0);
        if (custom[this.wiki] && custom[this.wiki][msg]) {
            clone.unshift(custom[this.wiki][msg]);
            originalClone.unshift(customOriginal[this.wiki][msg]);
        }
        for (let i = 0, l = clone.length; i < l; ++i) {
            const res = clone[i].exec(this._summary);
            if (res) {
                const ret = Array(res.length - 1);
                let max = 0;
                originalClone[i].match(/\$(\d+)/g).forEach(function(m, j) {
                    const n = Number(m.substring(1));
                    if (n > max) {
                        max = n;
                    }
                    ret[n - 1] = res[j + 1];
                });
                for (let j = max + 1, jl = res.length; j < jl; ++j) {
                    ret[j - 1] = res[j];
                }
                return ret;
            }
        }
        return null;
    }
    /**
     * Handles FANDOM's log fuckups
     * @private
     */
    _0() {
        this.FANDOMFuckedUp = true;
    }
    /**
     * Handles abuse filter summary extraction
     * @returns {Boolean|undefined} False if summary failed to parse
     * @private
     */
    _abusefilter() {
        const res = AF_REGEX.exec(this._summary);
        if (res) {
            this.id = Number(res[1]);
            this.diff = Number(res[2]);
        } else {
            return false;
        }
    }
    /**
     * Handles block summary extraction
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _block(res) {
        this.target = res.shift();
        if (this.action !== 'unblock') {
            this.expiry = res.shift();
            const flags = res.shift();
            if (flags) {
                this.flags = flags.split(',').map(function(f) {
                    for (let i = 0, l = BLOCK_FLAGS.length; i < l; ++i) {
                        if (
                            i18n[`block-log-flags-${BLOCK_FLAGS[i]}`]
                                .test(f.trim())
                        ) {
                            return BLOCK_FLAGS[i];
                        }
                    }
                    return 'unknown';
                });
            } else {
                this.flags = [];
            }
        }
        this.reason = res.shift();
    }
    /**
     * Handles chatban summary extraction
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _chatban(res) {
        this.target = res.shift();
        if (this.action !== 'chatbanremove') {
            this.length = res.shift();
            this.expires = res.shift();
        }
        this.reason = res.shift();
    }
    /**
     * Handles delete summary extraction
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _delete(res) {
        if (this.action === 'revision' || this.action === 'event') {
            this.target = res[2];
            this.reason = res[3];
        } else {
            this.page = res.shift();
            this.reason = res.shift();
        }
    }
    /**
     * Handles move summary extraction
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _move(res) {
        this.page = res.shift();
        this.target = res.shift();
        this.reason = res.shift();
    }
    /**
     * Handles patrol summary extraction
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _patrol(res) {
        this.revision = Number(res.shift());
        this.page = res.shift();
    }
    /**
     * Handles protect summary extraction
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _protect(res) {
        this.page = res.shift();
        if (this.action === 'move_prot') {
            this.target = res.shift();
        } else if (this.action !== 'unprotect') {
            this.level = [];
            const level = res.shift(),
                  regex = / \u200E\[(edit|move|upload|create)=(loggedin|autoconfirmed|sysop)\] \(([^\u200E]+)\)(?: \u200E|$|:)/g;
            let res2 = null;
            do {
                res2 = regex.exec(level);
                if (res2) {
                    regex.lastIndex -= 2;
                    this.level.push({
                        expiry: res2[3],
                        feature: res2[1],
                        level: res2[2]
                    });
                }
            } while (res2);
        }
        this.reason = res.shift();
    }
    /**
     * Handles rights summary extraction
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _rights(res) {
        this.target = res.shift();
        this.oldgroups = res.shift().split(',').map(s => s.trim());
        this.newgroups = res.shift().split(',').map(s => s.trim());
        this.reason = res.shift();
    }
    /**
     * Handles upload summary extraction
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _upload(res) {
        this.file = res.shift();
        this.reason = res.shift();
    }
    /**
     * Handles user avatar removals
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _useravatar(res) {
        this.target = res.shift();
    }
    /**
     * Handles wiki feature summaries
     * @returns {Boolean|null} False if wiki feature hasn't been extracted
     * @private
     */
    _wikifeatures() {
        const res = WIKIFEATURES_REGEX.exec(this._summary);
        if (res) {
            this.feature = res[1];
            this.value = res[2] === 'true';
        } else {
            return false;
        }
    }
}

module.exports = Message;
