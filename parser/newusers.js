/**
 * newusers.js
 *
 * Module for parsing messages from the new users channel.
 */
'use strict';

/**
 * Importing modules.
 */
const Message = require('./msg.js');

/**
 * Constants.
 */
const REGEX = /^(.+) New user registration https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?wiki\/Special:Log\/newusers$/;

/**
 * Parses messages representing user account creations.
 * @augments Message
 */
class NewUsersMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {String} raw Unparsed message from WikiaRC
     */
    constructor(parser, raw) {
        super(parser, raw, 'log');
        this.log = 'newusers';
        this.action = 'newusers';
        const res = REGEX.exec(raw);
        if (res) {
            this.user = res[1];
            this.wiki = res[2];
            this.domain = res[3];
            this.language = res[4] || 'en';
        } else {
            this._error(
                'newuserserror',
                'Failed to parse new users message.'
            );
        }
    }
}

module.exports = NewUsersMessage;
