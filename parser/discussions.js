/**
 * discussions.js
 *
 * Module for parsing messages from the Discussions activity channel.
 */
'use strict';

/**
 * Importing modules.
 */
const Message = require('./msg.js'),
      {decode} = require('../include/util.js');

/**
 * Constants.
 */
const DISCUSSION_URL_REGEX = /^https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?(?:d|f)\/p\/(\d{19,})(?:\/r\/(\d{19,}))?$/,
      ARTICLE_COMMENT_URL_REGEX = /^https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?wiki\/([^?]+)\?commentId=(\d{19,})(?:&replyId=(\d{19,}))?$/,
      MESSAGE_WALL_URL_REGEX = /^https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?wiki\/[^:]+:([^?]+)\?threadId=(\d{19,})(?:#(\d{19,}))?$/,
      TYPE_REGEX = /^(discussion|article-comment|message-wall)-(thread|post|reply|report)$/;

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
     *
     * Wondering why we have to parse all three types?
     * That is, of course, because Fandom uses the discussion-report type
     * for all reports, regardless of the platform they were made on.
     * @param {String} url Discussions URL to parse
     * @private
     */
    _extractURL(url) {
        let res = DISCUSSION_URL_REGEX.exec(url);
        if (res) {
            this.platform = 'discussion';
        } else {
            res = ARTICLE_COMMENT_URL_REGEX.exec(url);
            if (res) {
                this.platform = 'article-comment';
            } else {
                res = MESSAGE_WALL_URL_REGEX.exec(url);
                if (res) {
                    this.platform = 'message-wall';
                } else {
                    this._error(
                        'discussionsurl',
                        'Discussions URL failed to parse.'
                    );
                    return;
                }
            }
        }
        res.shift();
        this.wiki = res.shift();
        this.domain = res.shift();
        this.language = res.shift() || 'en';
        if (this.platform !== 'discussion') {
            this.page = decode(res.shift());
        }
        this.thread = res.shift();
        this.reply = res.shift();
    }
    /**
     * Extracts Discussions action type.
     * @param {String} type Discussions action type
     * @private
     */
    _extractType(type) {
        const res = TYPE_REGEX.exec(type);
        if (res) {
            this.platform = res[1];
            this.dtype = res[2];
        } else {
            this._error(
                'discussionstype',
                'Discussions action type failed to parse.'
            );
        }
    }
}

module.exports = DiscussionsMessage;
