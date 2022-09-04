/**
 * discussions.js
 *
 * Module for parsing messages from the Discussions activity channel.
 */
'use strict';

const Parser = require('./parser.js');
const Message = require('./msg.js');
const Client = require('../include/client.js');
const {decode} = require('../include/util.js');

const DISCUSSION_URL_REGEX = /^https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?(?:d|f)\/p\/(\d{19,})(?:\/r\/(\d{19,}))?$/u;
const ARTICLE_COMMENT_URL_REGEX = /^https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?index\.php\?curid=(\d+)&commentId=(\d{19,})(?:&replyId=(\d{19,}))?$/u;
const MESSAGE_WALL_URL_REGEX = /^https?:\/\/([a-z0-9-.]+)\.(fandom\.com|gamepedia\.(?:com|io)|wikia\.(?:com|org)|(?:wikia|fandom)-dev\.(?:com|us|pl))\/(?:([a-z-]+)\/)?wiki\/[^:]+:(.+)\?threadId=(\d{19,})(?:#(\d{19,}))?$/u;
const TYPE_REGEX = /^(discussion|article-comment|message-wall)-(thread|post|reply|report)$/u;
const ARTICLE_TITLE_EXPIRY = 3 * 24 * 60 * 60;

/**
 * Parses messages representing Discussions actions.
 * @augments Message
 */
class DiscussionsMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {string} raw Unparsed WikiaRC message
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
     * @param {object} json Parsed JSON object to extract data from
     * @param {string} json.url URL to the Discussions post
     * @param {string} json.type Type of the action taken
     * @param {string} json.snippet Snippet of the post
     * @param {string} json.size Size of the post
     * @param {string} json.category Category the post is in
     * @param {string} json.userName User who took the action
     * @param {string} json.action The taken action
     * @param {string} json.title Discussions post title
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
     * @param {string} url Discussions URL to parse
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
            try {
                this.page = decode(res.shift());
            } catch (error) {
                this._error(
                    'discussionsurl2',
                    'Discussions URL failed to decode.',
                    {error}
                );
            }
        }
        this.thread = res.shift();
        this.reply = res.shift();
    }
    /**
     * Extracts Discussions action type.
     * @param {string} type Discussions action type
     * @private
     */
    _extractType(type) {
        const res = TYPE_REGEX.exec(type);
        if (res) {
            [, this.platform, this.dtype] = res;
        } else {
            this._error(
                'discussionstype',
                'Discussions action type failed to parse.'
            );
        }
    }
    /**
     * Starts fetching more details about the message.
     * @param {Client} client Client instance to get external clients from
     * @param {string[]} properties Details to fetch
     */
    async fetch(client, properties) {
        const {wiki, language, domain, platform} = this;
        if (!properties.includes('title') || platform !== 'article-comment') {
            return;
        }
        const key = `title:${language}:${wiki}:${domain}:${this.page}`;
        const title = await client.cache.get(key);
        if (title) {
            this.page = title;
            return;
        }
        const response = await client.io.query(wiki, language, domain, {
            formatversion: 2,
            pageids: this.page
        });
        const {query: q} = response;
        if (!q || !q.pages || !q.pages[0] || q.pages[0].missing) {
            this._error('commenttitle', 'Failed to fetch comment title.', {
                response
            });
            return;
        }
        this.page = q.pages[0].title;
        await client.cache.set(key, this.page, 'EX', ARTICLE_TITLE_EXPIRY);
    }
}

module.exports = DiscussionsMessage;
