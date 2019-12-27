/**
 * rc.js
 *
 * Module for shared utilities between edit and log messages.
 */
'use strict';

/**
 * Importing modules.
 */
const Message = require('./msg.js');

/**
 * Parses messages received from the recent changes channel.
 * @augments Message
 */
class RCMessage extends Message {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {String} raw Unparsed message from WikiaRC
     * @param {Array} res Regular expression execution result
     * @param {String} type Message type
     */
    constructor(parser, raw, res, type) {
        super(parser, raw, type);
        this._cached = {};
        res.shift();
    }
    /**
     * Cleans up after a failed fetch.
     */
    cleanup() {
        super.cleanup();
        this._cached = {};
    }
    /**
     * Trims the unnecessary character off the summary.
     * @param {String} summary Summary to trim
     * @returns {String} Trimmed summary
     * @protected
     */
    _trimSummary(summary) {
        if (summary.endsWith('\x03')) {
            return summary.slice(0, -1);
        }
        return summary;
    }
    /**
     * Gets the parent thread title.
     * @returns {String} Parent thread title
     * @protected
     */
    _getParentThread() {
        if (!this._cached.parentThread) {
            this._cached.parentThread = this.page
                .split('/@comment-')
                .slice(0, 2)
                .join('/@comment-');
        }
        return this._cached.parentThread;
    }
    /**
     * Gets the Redis cache key part for the whole wiki.
     * @returns {String} Wiki name concatenated with the domain and language
     * @private
     */
    _getCacheKey() {
        if (!this._cached.cacheKey) {
            this._cached.cacheKey = `${this.wiki}:${this.domain}:${this.language}`;
        }
        return this._cached.cacheKey;
    }
    /**
     * Gets the Redis key for the title.
     * @param {Number} revid Revision ID for the key to get
     * @returns {String} Redis key for the title
     * @protected
     */
    _getTitleKey(revid) {
        return `title:${this._getCacheKey()}:${revid}`;
    }
    /**
     * Gets the Redis key for the thread title.
     * @returns {String} Redis key for the thread title
     * @protected
     */
    _getThreadTitleKey() {
        if (!this._cached.threadTitleKey) {
            this._cached.threadTitleKey = `threadtitle:${this._getCacheKey()}:${this._getParentThread()}`;
        }
        return this._cached.threadTitleKey;
    }
    /**
     * Gets the Redis key for the thread ID.
     * @returns {String} Redis key for the thread ID
     * @protected
     */
    _getThreadIDKey() {
        if (!this._cached.threadIDKey) {
            this._cached.threadIDKey = `threadid:${this._getCacheKey()}:${this._getParentThread()}`;
        }
        return this._cached.threadIDKey;
    }
}

module.exports = RCMessage;
