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
     * Returns a FANDOM wiki URL
     * @param {String} wiki Subdomain of the wiki
     * @param {String} lang Language of the wiki
     * @returns {String} URL to the requested wiki
     * @static
     */
    static url(wiki, lang) {
        const w = wiki || 'c',
              prefix = `${w.includes('.') ? 'http' : 'https'}://${w}.wikia.com`;
        if (!lang || lang === 'en') {
            return prefix;
        }
        return `${prefix}/${lang}`;
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
    /**
     * Decodes HTML
     * Reverse of mw.html.encode
     * @param {String} html HTML to decode
     * @returns {String} Decoded HTML
     * @static
     */
    static decodeHTML(html) {
        return String(html)
            .replace(/&#039;/g, '\'')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }
    /**
     * Capitalizes the first letter in a string
     * @param {String} str String to capitalize
     * @returns {String} String with the first letter capitalized
     * @static
     */
    static cap(str) {
        return `${str.charAt(0).toUpperCase()}${str.substring(1)}`;
    }
    /**
     * Checks if a string is an IP address
     * @param {String} str String to check
     * @returns {Boolean} If the supplied string is an IP address
     * @static
     */
    static isIP(str) {
        const spl1 = str.split('.'),
              spl2 = str.split(':');
        return spl1.length === 4 &&
               spl1.every(function(v) {
                   const num = Number(v);
                   return num >= 0 && num < 256;
               }) ||
               spl2.length === 6 &&
               spl2.every(function(v) {
                   if (v === '') {
                       return true;
                   }
                   const num = parseInt(v, 16);
                   return num >= 0 && num < 65536;
               });
    }
    /**
     * Checks if a string is an IP range
     * @param {String} str String to check
     * @returns {Boolean} If the supplied string is an IP address/range
     * @static
     */
    static isIPRange(str) {
        const spl = str.split('/');
        if (spl.length !== 2 || !this.isIP(spl[0])) {
            return false;
        }
        // See $wgBlockCIDRLimit configuration variable
        const cidrLimit = spl[0].includes(':') ? 19 : 16,
              range = Number(spl[1]);
        return !isNaN(range) && range <= cidrLimit;
    }
}

module.exports = Util;
