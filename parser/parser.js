/**
 * parser.js
 *
 * Module for handling message parser dispatching.
 */
'use strict';

/**
 * Importing modules.
 */
const DiscussionsMessage = require('./discussions.js'),
      EditMessage = require('./edit.js'),
      ErrorMessage = require('./error.js'),
      LogMessage = require('./log.js'),
      NewUsersMessage = require('./newusers.js'),
      util = require('../include/util.js');

/**
 * Constants.
 */
const EDIT_REGEX = /^\x0314\[\[\x0307([^\]]+)\x0314\]\]\x034 ([!NBM]*)\x0310 \x0302https?:\/\/([a-z0-9-.]+)\.(fandom\.com|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?index\.php\?(\S+)\x03 \x035\*\x03 \x0303([^\x03]+)\x03 \x035\*\x03 \(\x02?(\+|-)(\d+)\x02?\) \x0310(.*)$/,
      // NOTE: \s{2} is \s{1,2} due to overflow space removal.
      LOG_REGEX = /^\x0314\[\[\x0307[^:]+:Log\/([^\x03]+)\x0314\]\]\x034 ([^\x03]+)\x0310 \x0302https?:\/\/([a-z0-9-.]+)\.(fandom\.com|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?(?:wiki\/)?[^:]+:Log\/[^\x03]+\x03 \x035\*\x03 \x0303([^\x03]+)\x03 \x035\*\x03\s{1,2}\x0310(.*)$/;

/**
 * Class for parsing messages received from WikiaRC.
 */
class Parser {
    /**
     * Class constructor.
     * @param {Client} client Client instance
     * @param {Object} data Loader data
     */
    constructor(client, data) {
        this._client = client;
        for (const key in data) {
            this[`_${key}`] = data[key];
        }
        LogMessage.BLOCK_FLAGS.forEach(function(m) {
            const key = `block-log-flags-${m}`;
            if (typeof this._i18n[key] === 'string') {
                this._i18n[key] = new RegExp(this._i18n[key]);
            } else if (this._i18n[key] instanceof Array) {
                this._i18n[key] = new RegExp(
                    this._i18n[key]
                        .map(util.escapeRegex)
                        .join('|')
                );
            }
        }, this);
    }
    /**
     * Parses a message.
     * @param {String} raw Raw string from WikiaRC
     * @param {String} type Type of WikiaRC message
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
     * @param {String} wiki Wiki to update the messages on
     * @param {String} language Language of the wiki to update the messages on
     * @param {String} domain Domain of the wiki to update the messages on
     * @param {Object} messages Custom messages on the wiki
     * @param {Object} generated Processed custom messages on the wiki
     */
    update(wiki, language, domain, messages, generated) {
        const key = `${language}:${wiki}:${domain}`;
        this._custom[key] = messages[key];
        this._i18n2[key] = generated[key];
    }
    /**
     * Gets maps of i18n data-based regular expressions.
     * @returns {Object} I18n data-based regular expressions
     */
    get i18n() {
        return this._i18n;
    }
    /**
     * Gets message cache.
     * @returns {Object} Message cache
     */
    get messagecache() {
        return this._messagecache;
    }
    /**
     * Gets the map of custom messages.
     * @returns {Object} Map of custom messages
     */
    get custom() {
        return this._custom;
    }
    /**
     * Gets maps of custom message-based regular expressions.
     * @returns {Object} Custom message-based regular expressions
     */
    get i18n2() {
        return this._i18n2;
    }
}

module.exports = Parser;
