/**
 * discussions.js
 *
 * Module for parsing messages from the Discussions activity channel.
 */
'use strict';

/**
 * Importing modules.
 */
const Message = require('./msg.js');

/**
 * Constants.
 */
const URL_REGEX = /^https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?(?:d|f)\/p\/(\d{19,})(?:\/r\/(\d{19,}))?$/,
      TYPE_REGEX = /^discussion-(thread|post|report)$/;

/**
 * Parses messages representing Discussions actions.
 * @augments Message
 */
class DiscussionsMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {String} raw Unparsed WikiaRC message
     */
    constructor(parser, raw) {
        super(parser, raw, 'discussions');
        let json = null;
        try {
            json = JSON.parse(raw);
        } catch (error) {
            this._error(
                'discussionsjson',
                'Discussions JSON failed to parse.',
                {error}
            );
        }
        if (json) {
            this._extract(json);
        }
    }
    /**
     * Extracts Discussions data from parsed JSON.
     * @param {String} url URL to the Discussions post
     * @param {String} type Type of the action taken
     * @param {String} snippet Snippet of the post
     * @param {String} size Size of the post
     * @param {String} category Category the post is in
     * @param {String} userName User who took the action
     * @param {String} action The taken action
     * @param {String} title Discussions post title
     * @private
     */
    _extract({url, type, snippet, size, category, userName, action, title}) {
        this.url = url;
        this.snippet = snippet;
        this.size = Number(size);
        this.category = category;
        this.user = userName;
        this.action = action;
        this.title = title;
        this._extractType(type);
        this._extractURL(url);
    }
    /**
     * Extracts further Discussions data from parsed URL.
     * @param {String} url Discussions URL to parse
     * @private
     */
    _extractURL(url) {
        const res = URL_REGEX.exec(url);
        if (res) {
            this.wiki = res[1];
            this.domain = res[2];
            this.language = res[3] || 'en';
            this.thread = res[4];
            this.reply = res[5];
        } else {
            this._error(
                'discussionsurl',
                'Discussions URL failed to parse.'
            );
        }
    }
    /**
     * Extracts Discussions action type.
     * @param {String} type Discussions action type
     * @private
     */
    _extractType(type) {
        const res = TYPE_REGEX.exec(type);
        if (res) {
            this.dtype = res[1];
        } else {
            this._error(
                'discussionstype',
                'Discussions action type failed to parse.'
            );
        }
    }
}

module.exports = DiscussionsMessage;
