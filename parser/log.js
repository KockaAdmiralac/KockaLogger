/**
 * log.js
 *
 * Module for parsing messages representing log actions
 * in the recent changes channel.
 */
'use strict';

const Parser = require('./parser.js');
const RCMessage = require('./rc.js');

const AF_REGEX = /\[\[\x0302[^:]+:[^/]+\/(\d+)\x0310\]\].*(?:\(|（)\[\[[^:]+:[^/]+\/history\/\d+\/diff\/prev\/(\d+)\]\](?:\)|）)$/u;
const BLOCK_FLAGS = [
    'angry-autoblock',
    'anononly',
    'hiddenname',
    'noautoblock',
    'nocreate',
    'noemail',
    'nousertalk'
];
const MESSAGE_MAP = {
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
};
const PROTECTSITE_REGEX = / (\d+ (?:second|minute|hour|day|week|month|year)s?)?(?:\s?(?::|：)\s?(.*))?$/u;

/**
 * Parses log action related messages.
 * @augments RCMessage
 */
class LogMessage extends RCMessage {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {string} raw Unparsed message from WikiaRC
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
     * @returns {string[] | null} Parsing results if successful
     */
    _i18n() {
        const msg = MESSAGE_MAP[this.log][this.action];
        if (!msg) {
            return null;
        }
        // May be expensive.
        const clone = this._parser.i18n[msg].slice(0);
        const originalClone = this._parser.messagecache[msg].slice(0);
        const key = `${this.language}:${this.wiki}:${this.domain}`;
        if (this._parser.i18n2[key] && this._parser.i18n2[key][msg]) {
            clone.unshift(this._parser.i18n2[key][msg]);
            originalClone.unshift(this._parser.custom[key][msg]);
        }
        for (let i = 0, l = clone.length; i < l; ++i) {
            const res = clone[i].exec(this._summary);
            if (res) {
                const ret = Array(res.length - 1);
                let max = 0;
                originalClone[i].match(/(?<!GENDER:)\$(\d+)/ug).forEach(function(m, j) {
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
     * @param {string} duration Duration of the protection
     * @param {string} reason Protection reason, if specified
     * @returns {string} Parsable protect log summary
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
     * @returns {boolean?} False if summary failed to parse
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
     * @param {string[]} res I18n checking result
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
     * @param {string[]} res I18n checking result
     * @private
     */
    _delete(res) {
        if (this.action === 'revision' || this.action === 'event') {
            [, , this.target, this.reason] = res;
        } else {
            [this.page, this.reason] = res;
        }
    }
    /**
     * Handles move summary extraction.
     * @param {string[]} res I18n checking result
     * @private
     */
    _move(res) {
        [this.page, this.target, this.reason] = res;
    }
    /**
     * Handles patrol summary extraction.
     * @param {string[]} res I18n checking result
     * @private
     */
    _patrol(res) {
        this.revision = Number(res.shift());
        this.page = res.shift();
    }
    /**
     * Handles protect summary extraction.
     * @param {string[]} res I18n checking result
     * @private
     */
    _protect(res) {
        const pageWithLevels = res.shift();
        this.page = pageWithLevels.replace(/ \u200E.*$/ug, '');
        if (this.action === 'move_prot') {
            this.target = res.shift();
        } else if (this.action !== 'unprotect') {
            this.level = [];
            const level = pageWithLevels + res.shift();
            const regex = /\u200E\[(edit|move|upload|create|comment|everything)=(\w+)\] \(([^\u200E]+)\)+/ug;
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
     * @param {string[]} res I18n checking result
     * @private
     */
    _rights(res) {
        const regex = res.slice(0, 3);
        this.target = res.shift();
        const oldgroups = res.shift();
        const newgroups = res.shift();
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
     * @param {string[]} res I18n checking result
     * @private
     */
    _upload(res) {
        [this.file, this.reason] = res;
    }
}

/**
 * Expose constant to other modules.
 */
LogMessage.BLOCK_FLAGS = BLOCK_FLAGS;

module.exports = LogMessage;
