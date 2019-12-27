/**
 * edit.js
 *
 * Module for parsing messages representing edits
 * from the recent changes channel.
 */
'use strict';

/**
 * Importing modules.
 */
const RCMessage = require('./rc.js'),
      util = require('../include/util.js');

/**
 * Constants.
 */
const CACHE_EXPIRY = 3 * 24 * 60 * 60,
      TITLE_REGEX = /<ac_metadata [^>]*title="([^"]+)"[^>]*>\s*<\/ac_metadata>$/u;

/**
 * Parses WikiaRC messages representing edits.
 * @augments RCMessage
 */
class EditMessage extends RCMessage {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {String} raw Unparsed WikiaRC message
     * @param {Array} res Regular expression execution result
     */
    constructor(parser, raw, res) {
        super(parser, raw, res, 'edit');
        this.page = res.shift();
        this.flags = res.shift().split('');
        this.wiki = res.shift();
        this.domain = res.shift();
        this.language = res.shift() || 'en';
        this.params = {};
        res.shift().split('&').forEach(this._parseParam, this);
        this.user = res.shift();
        const sign = res.shift(),
              num = Number(res.shift());
        this.diff = sign === '-' ? -num : num;
        this.summary = this._trimSummary(res.shift());
    }
    /**
     * Parses a URL parameter.
     * @param {String} param Parameter to parse
     * @private
     */
    _parseParam(param) {
        const spl = param.split('=');
        this.params[spl[0]] = Number(spl[1]);
    }
    /**
     * Starts fetching more details about the message.
     * @param {Client} client Client instance to get external clients from
     * @param {Array<String>} properties Details to fetch
     */
    async fetch(client, properties) {
        super.fetch(client, properties);
        if (this._properties.includes('pageinfo')) {
            if (this.params.diff) {
                try {
                    const title = await client.cache.getAsync(
                        this._getTitleKey(this.params.oldid),
                        this._pageInfoCache.bind(this)
                    );
                    await this._handleCachedTitle(title);
                } catch (error) {
                    this._error(
                        'cache-pageinfo',
                        'Failed to fetch page info from cache',
                        {error}
                    );
                }
            } else {
                await this._pageInfoAPI();
            }
        }
    }
    /**
     * Handles a page title returned from cache.
     * @param {string} title The page's title
     * @private
     */
    async _handleCachedTitle(title) {
        if (title) {
            this.page = title;
            const key = this._getTitleKey(
                this.params.diff || this.params.oldid
            ), batch = this._client.cache
                .batch()
                .set(key, title)
                .expire(key, CACHE_EXPIRY)
                .del(this._getTitleKey(this.params.oldid));
            if (this._properties.includes('threadinfo')) {
                this.isMain = this._getParentThread() === title;
                try {
                    const data = batch
                        .get(this._getThreadTitleKey())
                        .get(this._getThreadIDKey())
                        .execAsync(this._threadInfoCache.bind(this));
                } catch (error) {
                    this._error(
                        'cache-threadinfo',
                        'Failed to fetch thread info from cache.',
                        {error}
                    );
                }
            } else {
                batch.exec(this._setPageInfoCache.bind(this));
                this._resolve();
            }
        } else {
            await this._pageInfoAPI();
        }
    }
    /**
     * Callback after fetching thread info from cache.
     * @param {Error} error Error that occurred while fetching thread info
     * @param {Array} data Data obtained from Redis operations
     * @private
     */
    _threadInfoCache(error, data) {
        const title = data[3],
              id = data[4],
              parent = this._getParentThread();
        if (title && id) {
            this.threadtitle = title;
            this.threadid = id;
            this._client.cache
                .batch()
                .expire(this._getThreadTitleKey(), CACHE_EXPIRY)
                .expire(this._getThreadIDKey(), CACHE_EXPIRY)
                .exec(this._setThreadExpiryCache.bind(this));
            this._resolve();
        } else {
            this._threadInfoAPI(parent);
        }
    }
    /**
     * Callback after setting page info in cache.
     * @param {Error} error Error that occurred while setting page info
     * @private
     */
    _setPageInfoCache(error) {
        if (error) {
            // This error is most likely never going to get logged anywhere.
            this._error(
                'cache-setpageinfo',
                'Failed to set page info in cache.',
                {error}
            );
        }
    }
    /**
     * Callback after resetting expiry of thread title and ID.
     * @param {Error} error Error that occurred while setting page info
     * @private
     */
    _setThreadExpiryCache(error) {
        if (error) {
            // This error is most likely never going to get logged anywhere.
            this._error(
                'cache-setexpirycache',
                'Failed to reset thread info expiry in cache.',
                {error}
            );
        }
    }
    /**
     * Fetches page info from the API.
     * @private
     */
    _pageInfoAPI() {
        const params = {
            indexpageids: 1,
            revids: this.params.diff || this.params.oldid
        };
        if (
            this._properties.includes('threadinfo') ||
            this._properties.includes('content')
        ) {
            Object.assign(params, {
                prop: 'revisions',
                rvprop: 'content'
            });
        }
        this._client.io.query(this.wiki, this.language, this.domain, params)
            .then(this._pageInfoAPICallback.bind(this))
            .catch(error => this._error(
                'api-pageinfo',
                'Failed to obtain page information from the API.',
                {error}
            ));
    }
    /**
     * Callback after fetching page information from the API.
     * @param {Object} obj MediaWiki API response
     * @param {Object} obj.error API error that occurred
     * @param {Object} obj.query API response
     * @private
     */
    _pageInfoAPICallback({error, query}) {
        if (error) {
            this._error(
                'api-pageinfo',
                'API returned an error when obtaining page information.',
                {error}
            );
        } else if (
            !(query.pageids instanceof Array) ||
            query.pageids[0] === '-1'
        ) {
            this._error(
                'api-notitle',
                'API responded with no page.',
                {query}
            );
        } else {
            const page = query.pages[query.pageids[0]];
            this.page = page.title;
            this.namespace = page.ns;
            if (this._properties.includes('content')) {
                this.content = page.revisions[0]['*'];
            }
            const parent = this._getParentThread(),
                  key = this._getTitleKey(
                      this.params.diff || this.params.oldid
                  ), batch = this._client.cache
                    .batch()
                    .set(key, page.title)
                    .expire(key, CACHE_EXPIRY);
            this.isMain = parent === page.title &&
                          this._properties.includes('threadinfo');
            if (this.isMain) {
                if (this._properties.includes('threadinfo')) {
                    this._extractThreadInfo(page, batch);
                } else {
                    this._resolve();
                }
            } else {
                batch.exec(this._setPageInfoCache.bind(this));
                if (this._properties.includes('threadinfo')) {
                    this._threadInfoAPI(parent);
                } else {
                    this._resolve();
                }
            }
        }
    }
    /**
     * Fetches thread information from the API.
     * @param {String} parent Parent thread title
     * @private
     */
    _threadInfoAPI(parent) {
        this._client.io.query(this.wiki, this.language, this.domain, {
            indexpageids: 1,
            prop: 'revisions',
            rvprop: 'content',
            titles: parent
        }).then(this._threadInfoAPICallback.bind(this))
        .catch(error => this._error(
            'api-threadinfo',
            'Failed to obtain thread information from the API.',
            {error}
        ));
    }
    /**
     * Callback after fetching thread information from the API.
     * @param {Object} error API error that occurred
     * @param {Object} query API response
     * @private
     */
    _threadInfoAPICallback({error, query}) {
        if (error) {
            this._error(
                'api-threadinfo',
                'API returned an error when obtaining thread information.',
                {error}
            );
        } else if (
            !(query.pageids instanceof Array) ||
            query.pageids[0] === '-1'
        ) {
            this._error(
                'api-nothread',
                'API returned no valid thread page.',
                {query}
            );
        } else {
            this._extractThreadInfo(
                query.pages[query.pageids[0]],
                this._client.cache.batch()
            );
        }
    }
    /**
     * Extracts thread-related information from page information.
     * @param {Object} page Page information
     * @param {redis.Batch} batch Cache batch to set cache entries on
     * @private
     */
    _extractThreadInfo(page, batch) {
        this.threadid = Number(page.pageid);
        const res = TITLE_REGEX.exec(page.revisions[0]['*']);
        if (res) {
            this.threadtitle = util.decodeHTML(res[1]);
            const titleKey = this._getThreadTitleKey(),
                  idKey = this._getThreadIDKey();
            batch
                .set(titleKey, this.threadtitle)
                .set(idKey, this.threadid)
                .expire(titleKey, CACHE_EXPIRY)
                .expire(idKey, CACHE_EXPIRY)
                .exec(this._setPageInfoCache.bind(this));
            this._resolve();
        } else {
            this._error('threadtitleparse', 'Failed to parse thread title.');
        }
    }
}

module.exports = EditMessage;
