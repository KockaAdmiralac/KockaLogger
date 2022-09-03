/**
 * io.js
 *
 * Module for all HTTP communication.
 */
'use strict';

const got = require('got');
const util = require('./util.js');

/**
 * HTTP communication handler.
 */
class IO {
    /**
     * Class constructor. Creates the HTTP client shared by other methods.
     */
    constructor() {
        this._client = got.extend({
            headers: {
                'User-Agent': util.USER_AGENT
            }
        });
    }
    /**
     * Queries the MediaWiki API.
     * @param {string} wiki Wiki to query
     * @param {string} lang Language of the wiki to query
     * @param {string} domain Domain of the wiki to query
     * @param {object} options Query parameters
     * @param {Function} transform Transformation function
     * @returns {Promise} Promise to listen for response
     */
    async query(wiki, lang, domain, options, transform) {
        if (
            typeof wiki !== 'string' ||
            typeof options !== 'object'
        ) {
            return;
        }
        const response = await this._client.get(
            `${util.url(wiki, lang, domain)}/api.php`,
            {
                searchParams: {
                    action: 'query',
                    cb: Date.now(),
                    format: 'json',
                    ...options
                }
            }
        ).json();
        if (typeof transform === 'function') {
            return transform(response);
        }
        return response;
    }
    /**
     * Gets user info for a user with specified user ID.
     * @param {number} id User ID of the user
     * @returns {Promise} Promise to listen on for response
     */
    userInfo(id) {
        return this._client.get(
            `https://services.fandom.com/user-attribute/user/bulk?id=${id}`,
            {
                headers: {
                    accept: '*/*'
                }
            }
        ).json();
    }
}

module.exports = IO;
