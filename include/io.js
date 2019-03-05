/**
 * io.js
 *
 * Module for all HTTP communication.
 */
'use strict';

/**
 * Importing modules
 */
const http = require('request-promise-native'),
      util = require('./util.js');

/**
 * HTTP communication handler.
 */
class IO {
    /**
     * Queries the MediaWiki API.
     * @param {String} wiki Wiki to query
     * @param {String} lang Language of the wiki to query
     * @param {String} domain Domain of the wiki to query
     * @param {Object} options Query parameters
     * @param {Function} transform Transformation function
     * @returns {Promise} Promise to listen for response
     */
    query(wiki, lang, domain, options, transform) {
        if (
            typeof wiki !== 'string' ||
            typeof options !== 'object'
        ) {
            return;
        }
        options.action = 'query';
        options.cb = Date.now();
        options.format = 'json';
        return http({
            headers: {
                'User-Agent': util.USER_AGENT
            },
            json: true,
            method: 'GET',
            qs: options,
            transform,
            uri: `${util.url(wiki, lang, domain)}/api.php`
        });
    }
    /**
     * Posts to a webhook.
     * @param {String} url Webhook URL
     * @param {Object} body POST body
     * @returns {Promise} Promise to listen on for response
     */
    webhook(url, body) {
        return http({
            body,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': util.USER_AGENT
            },
            json: true,
            method: 'POST',
            uri: url
        });
    }
    /**
     * Gets user info for a user with specified user ID.
     * @param {Number} id User ID of the user
     * @returns {Promise} Promise to listen on for response
     */
    userInfo(id) {
        return http({
            headers: {
                'User-Agent': util.USER_AGENT
            },
            method: 'GET',
            uri: `https://services.fandom.com/user-attribute/user/bulk?id=${id}`
        });
    }
}

module.exports = IO;
