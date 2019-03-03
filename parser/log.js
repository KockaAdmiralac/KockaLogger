/**
 * log.js
 *
 * Module for parsing messages representing log actions
 * in the recent changes channel.
 */
'use strict';

/**
 * Importing modules.
 */
const RCMessage = require('./rc.js'),
      util = require('../include/util.js');

/**
 * Constants.
 */
const AF_REGEX = /https?:\/\/[a-z0-9-.]+\.(?:fandom\.com|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:[a-z-]+\/)?wiki\/[^:]+:[^/]+\/(\d+).*\(https?:\/\/[a-z0-9-.]+\.(?:fandom\.com|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:[a-z-]+\/)?wiki\/[^:]+:[^/]+\/history\/\d+\/diff\/prev\/(\d+)\)$/,
BLOCK_FLAGS = [
    'angry-autoblock',
    'anononly',
    'hiddenname',
    'noautoblock',
    'noemail',
    'nousertalk'
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
        event: 'logentry-delete-event-legacy',
        restore: 'undeletedarticle',
        revision: 'logentry-delete-revision-legacy'
    },
    move: {
        move: '1movedto2',
        // eslint-disable-next-line
        move_redir: '1movedto2_redir',
        restore: '1movedto2'
    },
    patrol: {
        patrol: 'patrol-log-line'
    },
    protect: {
        modify: 'modifiedarticleprotection',
        // eslint-disable-next-line
        move_prot: 'movedarticleprotection',
        protect: 'protectedarticle',
        restore: 'protectedarticle',
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
},
WIKIFEATURES_REGEX = /^wikifeatures\s?(?:：|:)\s?set extension option\s?(?:：|:)\s?(\w+) = (true|false)$/,
PROTECTSITE_REGEX = / (\d+ (?:second|minute|hour|day|week|month|year)s?)?(?:\s?(?::|：)\s?(.*))?$/,
// TODO: DRY?
CACHE_EXPIRY = 3 * 24 * 60 * 60,
TITLE_REGEX = /<ac_metadata [^>]*title="([^"]+)"[^>]*>\s*<\/ac_metadata>$/;

/**
 * Parses log action related messages.
 * @augments RCMessage
 */
class LogMessage extends RCMessage {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {String} raw Unparsed message from WikiaRC
     * @param {Array} res Regular expression execution result
     */
    constructor(parser, raw, res) {
        super(parser, raw, res, 'log');
        this.log = res.shift();
        this.action = res.shift();
        this.wiki = res.shift();
        this.domain = res.shift();
        this.language = res.shift() || 'en';
        this.user = res.shift();
        this._summary = this._trimSummary(res.shift());
        if (this.log !== 'useravatar' || this.action !== 'avatar_chn') {
            this._advanced();
        }
    }
    /**
     * Advanced log parsing.
     * @private
     */
    _advanced() {
        // If there's a handler for this action, attempt to handle it.
        if (typeof this[`_${this.log}`] === 'function') {
            let res = null;
            if (MESSAGE_MAP[this.log]) {
                // Article comments suck.
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
                    this._error(
                        'logparsefail',
                        'Failed to parse log action.'
                    );
                    return;
                }
            }
            if (this[`_${this.log}`](res) !== false) {
                delete this._summary;
            }
        } else {
            // We've encountered an unexpected action.
            this.summary = this._summary;
            delete this._summary;
            this._error(
                'logactionunknown',
                'Failed to parse log due to unknown log action.'
            );
        }
    }
    /**
     * Attempts to parse the summary based on regular expressions
     * generated from i18n MediaWiki messages.
     * @param {String} msg Message to get the summary from
     * @param {String} summary Summary to attempt parsing on
     * @returns {Array<String>|null} Parsing results if successful
     */
    _i18n() {
        const msg = MESSAGE_MAP[this.log][this.action];
        if (!msg) {
            return null;
        }
        // May be expensive.
        const clone = this._parser.i18n[msg].slice(0),
              originalClone = this._parser.messagecache[msg].slice(0),
              key = `${this.language}:${this.wiki}:${this.domain}`;
        if (this._parser.i18n2[key] && this._parser.i18n2[key][msg]) {
            clone.unshift(this._parser.i18n2[key][msg]);
            originalClone.unshift(this._parser.custom[key][msg]);
        }
        for (let i = 0, l = clone.length; i < l; ++i) {
            const res = clone[i].exec(this._summary);
            if (res) {
                const ret = Array(res.length - 1);
                let max = 0;
                originalClone[i].match(/(?<!GENDER:)\$(\d+)/g).forEach(function(m, j) {
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
        return this._handleProtectSite();
    }
    /**
     * Handles ProtectSite protections.
     * @returns {Array|null} Array of parsing results
     * @private
     */
    _handleProtectSite() {
        if (
            this.log === 'protect' &&
            (
                this.action === 'protect' ||
                this.action === 'unprotect'
            ) &&
            this._summary.includes(':Allpages') &&
            !this.protectsite
        ) {
            const res = PROTECTSITE_REGEX.exec(this._summary);
            if (res) {
                // This is a major hack but, to be fair, so is ProtectSite.
                this._summary = this._summary.replace(
                    PROTECTSITE_REGEX,
                    ' \u200E[everything=restricted] ($1): $2'
                );
                this.protectsite = true;
                return this._i18n();
            }
        }
        return null;
    }
    /**
     * Handles Fandom's log fuckups.
     * @private
     */
    _0() {
        this.fandomFuckedUp = true;
    }
    /**
     * Handles abuse filter summary extraction.
     * @returns {Boolean|undefined} False if summary failed to parse
     * @private
     */
    _abusefilter() {
        const res = AF_REGEX.exec(this._summary);
        if (res) {
            this.id = Number(res[1]);
            this.diff = Number(res[2]);
        } else {
            this._error('afparseerr', 'Failed to parse AbuseFilter summary.');
            return false;
        }
    }
    /**
     * Handles block summary extraction.
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
                            this._parser.i18n[`block-log-flags-${BLOCK_FLAGS[i]}`]
                                .test(f.trim())
                        ) {
                            return BLOCK_FLAGS[i];
                        }
                    }
                    return 'unknown';
                }, this);
            } else {
                this.flags = [];
            }
        }
        this.reason = res.shift();
    }
    /**
     * Handles chatban summary extraction.
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
     * Handles delete summary extraction.
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
     * Handles move summary extraction.
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _move(res) {
        this.page = res.shift();
        this.target = res.shift();
        this.reason = res.shift();
    }
    /**
     * Handles patrol summary extraction.
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _patrol(res) {
        this.revision = Number(res.shift());
        this.page = res.shift();
    }
    /**
     * Handles protect summary extraction.
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
                  regex = / \u200E\[(edit|move|upload|create|everything)=\w+\] \(([^\u200E]+)\)(?: \u200E|$|:)/g;
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
     * Handles rights summary extraction.
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _rights(res) {
        const regex = res.slice(0, 3);
        this.target = res.shift();
        const oldgroups = res.shift(),
              newgroups = res.shift();
        if (!oldgroups || !newgroups) {
            this._error(
                'missinggroups',
                'Groups missing from rights log entry.',
                {regex}
            );
        }
        if (oldgroups) {
            this.oldgroups = oldgroups.split(',').map(s => s.trim());
        }
        if (newgroups) {
            this.newgroups = newgroups.split(',').map(s => s.trim());
        }
        this.reason = res.shift();
    }
    /**
     * Handles upload summary extraction.
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _upload(res) {
        this.file = res.shift();
        this.reason = res.shift();
    }
    /**
     * Handles user avatar removals.
     * @param {Array<String>} res I18n checking result
     * @private
     */
    _useravatar(res) {
        this.target = res.shift();
    }
    /**
     * Handles wiki feature summaries.
     * @returns {Boolean|null} False if wiki feature hasn't been extracted
     * @private
     */
    _wikifeatures() {
        const res = WIKIFEATURES_REGEX.exec(this._summary);
        if (res) {
            this.feature = res[1];
            this.value = res[2] === 'true';
        } else {
            this._error(
                'wikifeatureserror',
                'Failed to parse wiki features log entry.'
            );
            return false;
        }
    }
    /**
     * Starts fetching more details about the message.
     * @param {Client} client Client instance to get external clients from
     * @param {Array<String>} properties Details to fetch
     * @param {Array<String>} interested Modules interested in the message
     * @returns {Promise} Promise that resolves when the details are fetched
     */
    fetch(client, properties, interested) {
        const promise = super.fetch(client, properties, interested);
        if (this._properties.includes('threadlog')) {
            this._client.io.query(
                this.wiki,
                this.language,
                this.domain,
                {
                    cb: Date.now(),
                    list: 'recentchanges',
                    rcprop: 'comment|ids|loginfo|title|user',
                    rctype: 'log'
                }
            ).then(this._threadLogCallback.bind(this))
            .catch(error => this._error(
                'api-threadlog',
                'Failed to obtain thread log information from the API.',
                {error}
            ));
        }
        return promise;
    }
    /**
     * Callback after fetching thread log information.
     * @param {Object} error The error API returned
     * @param {Object} query The data API returned
     * @private
     */
    _threadLogCallback({error, query}) {
        if (error) {
            this._error(
                'api-threadlog',
                'API returned an error when fetching thread log information.',
                {error}
            );
        } else {
            const rc = query.recentchanges.find(l => l.logtype === '0');
            if (rc) {
                this.log = 'thread';
                this.page = rc.title;
                this.user = rc.user;
                this.action = rc.logaction;
                this.namespace = rc.ns;
                this.reason = rc.comment;
                this.threadid = rc.pageid;
                this._client.cache.get(
                    this._getThreadTitleKey(),
                    this._threadTitleCacheCallback.bind(this)
                );
            } else {
                // Attach more information to the error?
                this._error(
                    'threadlognofind',
                    'Cannot find relevant thread logs in recent changes.'
                );
            }
        }
    }
    /**
     * Callback after fetching the thread title from cache.
     * @param {Object} error Redis error that occurred
     * @param {String} title Title of the thread
     * @private
     */
    _threadTitleCacheCallback(error, title) {
        if (error) {
            this._error(
                'cache-threadtitle',
                'Failed to fetch thread title from cache.',
                {error}
            );
        } else if (title) {
            this.threadtitle = title;
            const idKey = this._getThreadIDKey();
            this._client.cache
                .batch()
                .expire(this._getThreadTitleKey(), CACHE_EXPIRY)
                .set(idKey, this.threadid)
                .expire(idKey, CACHE_EXPIRY)
                .exec(this._setThreadCache.bind(this));
            this._resolve();
        } else {
            this._client.io.query(this.wiki, this.language, this.domain, {
                indexpageids: 1,
                prop: 'revisions',
                rvprop: 'content',
                titles: this._getParentThread()
            }).then(this._threadTitleAPICallback.bind(this))
            .catch(err => this._error(
                'api-threadinfo',
                'Failed to obtain thread information from the API.',
                {
                    error: err
                }
            ));
        }
    }
    /**
     * Callback after setting thread-related cache entries.
     * @param {Error} error Redis error that occurred
     * @private
     */
    _setThreadCache(error) {
        if (error) {
            this._error(
                'cache-setthreadcache',
                'Failed to set thread entries in cache.',
                {error}
            );
        }
    }
    /**
     * Callback after fetching the thread title from the API.
     * @param {Object} error API error that occurred
     * @param {Object} query API query results
     * @private
     */
    _threadTitleAPICallback({error, query}) {
        if (error) {
            this._error(
                'api-titleapi',
                'Failed to fetch thread title data from API.',
                {error}
            );
        } else if (query.pageids[0] === '-1') {
            this._error(
                'api-notitle',
                'API responded with no page.',
                {query}
            );
        } else {
            const res = TITLE_REGEX.exec(
                query
                    .pages[query.pageids[0]]
                    .revisions[0]['*']
            );
            if (res) {
                this.threadtitle = util.decodeHTML(res[1]);
                const titleKey = this._getThreadTitleKey(),
                      idKey = this._getThreadIDKey();
                this._client.cache
                    .batch()
                    .set(titleKey, this.threadtitle)
                    .set(idKey, this.threadid)
                    .expire(titleKey, CACHE_EXPIRY)
                    .expire(idKey, CACHE_EXPIRY)
                    .exec(this._setThreadCache.bind(this));
                this._resolve();
            } else {
                this._error(
                    'threadtitleparse',
                    'Failed to parse thread title.'
                );
            }
        }
    }
}

/**
 * Expose constant to other modules.
 */
LogMessage.BLOCK_FLAGS = BLOCK_FLAGS;

module.exports = LogMessage;
