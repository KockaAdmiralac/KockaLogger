/**
 * util.js
 *
 * Module for shared utilities through the project
 */
'use strict';

/**
 * Class for shared utilities through the project
 */
class Util {
    /**
     * Returns a Wikia wiki URL
     * @param {String} wiki Subdomain of the wiki
     * @returns {String} URL to the requested wiki
     * @static
     */
    static url(wiki) {
        const w = wiki || 'c';
        return `${w.includes('.') ? 'http' : 'https'}://${w}.wikia.com`;
    }
    /**
     * Escapes a string from special regex characters
     * @see https://stackoverflow.com/a/3561711
     * @param {String} text String to escape
     * @returns {String} String with special regex characters escaped
     * @static
     */
    static escapeRegex(text) {
        return text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    }
    /**
     * Encodes URL components MediaWiki-style
     * Based on mw.util.wikiUrlencode
     * @param {String} url URL to encode
     * @returns {String} Encoded URL
     * @static
     */
    static encode(url) {
        return encodeURIComponent(url)
            .replace(/!/g, '%21')
            .replace(/'/g, '%27')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/\*/g, '%2A')
            .replace(/~/g, '%7E')
            .replace(/%20/g, '_')
            .replace(/%3A/g, ':')
            .replace(/%2F/g, '/');
    }
}

module.exports = Util;
