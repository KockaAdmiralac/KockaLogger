/**
 * parser.js
 *
 * Module for handling message parser dispatching.
 */
'use strict';

const DiscussionsMessage = require('./discussions.js');
const EditMessage = require('./edit.js');
const ErrorMessage = require('./error.js');
const LogMessage = require('./log.js');
const Message = require('./msg.js');
const NewUsersMessage = require('./newusers.js');
const {escapeRegex} = require('../include/util.js');

const EDIT_REGEX = /^\x0314\[\[\x0307([^\]]+)\x0314\]\]\x034 ([!NBM]*)\x0310 \x0302https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?index\.php\?(\S+)\x03 \x035\*\x03 \x0303([^\x03]+)\x03 \x035\*\x03 \(\x02?(\+|-)(\d+)\x02?\) \x0310(.*)$/u;
// NOTE: \s{2} is \s{1,2} due to overflow space removal.
const LOG_REGEX = /^\x0314\[\[\x0307[^:]+:Log\/([^\x03]+)\x0314\]\]\x034 ([^\x03]+)\x0310 \x0302(?:https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?wiki\/[^:]+:Log\/[^\x03]+)?\x03 \x035\*\x03 \x0303([^\x03]+)\x03 \x035\*\x03\s{1,2}\x0310(.*)$/u;

/**
 * Class for parsing messages received from WikiaRC.
 */
class Parser {
    /**
     * Class constructor.
     * @param {object} data Loader data
     */
    constructor(data) {
        for (const key in data) {
            this[`_${key}`] = data[key];
        }
        for (const flag of LogMessage.BLOCK_FLAGS) {
            const key = `block-log-flags-${flag}`;
            if (typeof this._i18n[key] === 'string') {
                this._i18n[key] = new RegExp(this._i18n[key], 'u');
            } else if (this._i18n[key] instanceof Array) {
                this._i18n[key] = new RegExp(
                    this._i18n[key]
                        .map(escapeRegex)
                        .join('|'),
                    'u'
                );
            }
        }
    }
    /**
     * Parses a message.
     * @param {string} raw Raw string from WikiaRC
     * @param {string} type Type of WikiaRC message
     * @returns {Message} Parsed message
     */
    parse(raw, type) {
        let res = null;
        switch (type) {
            case 'rc':
                res = EDIT_REGEX.exec(raw);
                if (res) {
                    return new EditMessage(this, raw, res);
                }
                res = LOG_REGEX.exec(raw);
                if (res) {
                    return new LogMessage(this, raw, res);
                }
                return new ErrorMessage(
                    this,
                    raw,
                    'rcerror',
                    'Cannot parse RC message.'
                );
            case 'discussions':
                return new DiscussionsMessage(this, raw);
            case 'newusers':
                return new NewUsersMessage(this, raw);
            default:
                return new ErrorMessage(
                    this,
                    raw,
                    'unknowntype',
                    'Unknown message type.',
                    {type}
                );
        }
    }
    /**
     * Updates custom messages.
     * @param {string} key Key to store the messages under
     * @param {object} messages Custom messages on the wiki
     * @param {object} generated Processed custom messages on the wiki
     */
    update(key, messages, generated) {
        this._custom[key] = messages[key];
        this._i18n2[key] = generated[key];
    }
    /**
     * Gets maps of i18n data-based regular expressions.
     * @returns {object} I18n data-based regular expressions
     */
    get i18n() {
        return this._i18n;
    }
    /**
     * Gets message cache.
     * @returns {object} Message cache
     */
    get messagecache() {
        return this._messagecache;
    }
    /**
     * Gets the map of custom messages.
     * @returns {object} Map of custom messages
     */
    get custom() {
        return this._custom;
    }
    /**
     * Gets maps of custom message-based regular expressions.
     * @returns {object} Custom message-based regular expressions
     */
    get i18n2() {
        return this._i18n2;
    }
}

module.exports = Parser;
