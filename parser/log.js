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
const RCMessage = require('./rc.js');

/**
 * Constants.
 */
const AF_REGEX = /\[\[\x0302[^:]+:[^/]+\/(\d+)\x0310\]\].*(?:\(|（)\[\[[^:]+:[^/]+\/history\/\d+\/diff\/prev\/(\d+)\]\](?:\)|）)$/,
BLOCK_FLAGS = [
    'angry-autoblock',
    'anononly',
    'hiddenname',
    'noautoblock',
    'nocreate',
    'noemail',
    'nousertalk'
], MESSAGE_MAP = {
    block: {
        block: 'blocklogentry',
        reblock: 'reblock-logentry',
        unblock: 'unblocklogentry'
    },
    delete: {
        delete: 'deletedarticle',
        /* eslint-disable camelcase */
        delete_redir: 'logentry-delete-delete_redir',
        delete_redir2: 'logentry-delete-delete_redir',
        /* eslint-enable camelcase */
        event: 'logentry-delete-event-legacy',
        restore: 'undeletedarticle',
        revision: 'logentry-delete-revision-legacy'
    },
    move: {
        move: '1movedto2',
        // eslint-disable-next-line camelcase
        move_redir: '1movedto2_redir'
    },
    patrol: {
        patrol: 'patrol-log-line'
    },
    protect: {
        modify: 'modifiedarticleprotection',
        // eslint-disable-next-line camelcase
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
        revert: 'overwroteimage',
        upload: 'uploadedimage'
    }
},
PROTECTSITE_REGEX = / (\d+ (?:second|minute|hour|day|week|month|year)s?)?(?:\s?(?::|：)\s?(.*))?$/;

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
        // If there's a handler for this action, attempt to handle it.
        if (typeof this[`_${this.log}`] === 'function') {
            let res2 = null;
            if (MESSAGE_MAP[this.log]) {
                res2 = this._i18n();
                if (!res2) {
                    this._error(
                        'logparsefail',
                        'Failed to parse log action.'
                    );
                    return;
                }
            }
            if (this[`_${this.log}`](res2) !== false) {
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
                    this._protectSiteReplace.bind(this)
                );
                this.protectsite = true;
                return this._i18n();
            }
        }
        return null;
    }
    /**
     * Replaces a ProtectSite summary with something parsable.
     * @param {*} _ Unused
     * @param {String} duration Duration of the protection
     * @param {String} reason Protection reason, if specified
     * @returns {String} Parsable protect log summary
     * @private
     */
    _protectSiteReplace(_, duration, reason) {
        const base = ` \u200E[everything=restricted] (${duration})`;
        if (reason) {
            return `${base}: ${reason.replace(`${duration}: `, '').trim()}`;
        }
        return base;
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
            this.flags = flags ?
                flags.split(',').map(flag => BLOCK_FLAGS.find(
                        f => this._parser.i18n[`block-log-flags-${f}`]
                            .test(flag.trim())
                    ) || 'unknown') :
                [];
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
                  regex = / \u200E\[(edit|move|upload|create|comment|everything)=(\w+)\] \(([^\u200E]+)\)(?: \u200E|$|:)/g;
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
}

/**
 * Expose constant to other modules.
 */
LogMessage.BLOCK_FLAGS = BLOCK_FLAGS;

module.exports = LogMessage;
