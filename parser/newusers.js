/**
 * newusers.js
 *
 * Module for parsing messages from the new users channel.
 */
'use strict';

const Message = require('./msg.js');
const Parser = require('./parser.js');

const REGEX = /^(.+) New user registration https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?wiki\/Special:Log\/newusers$/u;

/**
 * Parses messages representing user account creations.
 * @augments Message
 */
class NewUsersMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {string} raw Unparsed message from WikiaRC
     */
    constructor(parser, raw) {
        super(parser, raw, 'log');
        this.log = 'newusers';
        this.action = 'newusers';
        const res = REGEX.exec(raw);
        if (res) {
            [, this.user, this.wiki, this.domain, this.language] = res;
            this.language = this.language || 'en';
        } else {
            this._error(
                'newuserserror',
                'Failed to parse new users message.'
            );
        }
    }
}

module.exports = NewUsersMessage;
