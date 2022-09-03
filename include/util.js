/**
 * util.js
 *
 * Module for shared utilities throughout the project.
 */
'use strict';

/**
 * Importing modules.
 */
const net = require('net'),
      {escapeMarkdown} = require('discord.js'),
      pkg = require('../package.json');

/**
 * Class for shared utilities through the project.
 */
class Util {
    /**
     * Returns a Fandom wiki URL.
     * @param {String} wiki Subdomain of the wiki
     * @param {String} lang Language of the wiki
     * @param {String} domain Domain of the wiki
     * @returns {String} URL to the requested wiki
     * @static
     */
    static url(wiki, lang, domain) {
        if (lang && lang !== 'en') {
            return `https://${wiki}.${domain}/${lang}`;
        }
        return `https://${wiki}.${domain}`;
    }
    /**
     * Returns a Fandom wiki URL without the protocol.
     * @param {String} wiki Subdomain of the wiki
     * @param {String} lang Language of the wiki
     * @param {String} domain Domain of the wiki
     * @returns {String} URL to the requested wiki (protocol-less)
     * @static
     */
    static shorturl(wiki, lang, domain) {
        let url = `${wiki}.${domain}`;
        if (lang && lang !== 'en') {
            url = `${url}/${lang}`;
        }
        return url;
    }
    /**
     * Escapes Markdown used on Discord so it can be safely relayed as an edit
     * summary/log reason.
     *
     * Does not escape mentions, because it may be useful to see them. Whether
     * mentions should actually mention someone should be controlled through
     * the `allowedMentions` field of `WebhookClientOptions` from discord.js.
     * @param {String} text Markdown to escape
     * @returns {String} Escaped parameter
     * @static
     */
    static escape(text) {
        return escapeMarkdown(
            text
                // Escape links.
                .replace(/(https?):\/\//g, '$1:/\u200B/')
                // Escape invite links.
                .replace(/discord\.gg/g, 'discord\u200B.\u200Bgg')
                // Remove line breaks.
                .replace(/\r?\n|\r/g, '')
                // Escape Markdown escape sequences
                .replace(/\\/g, '\\\\'),
            {
                inlineCode: false,
                strikethrough: false
            }
        );
    }
    /**
     * Escapes a string from special regex characters.
     * @see https://stackoverflow.com/a/3561711
     * @param {String} text String to escape
     * @returns {String} String with special regex characters escaped
     * @static
     */
    static escapeRegex(text) {
        return text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    }
    /**
     * Encodes URL components MediaWiki-style.
     * Based on mw.util.wikiUrlencode.
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
     * Decodes URL components MediaWiki-style.
     * @param {String} url URL to decode
     * @returns {String} Decoded URL
     * @static
     */
    static decode(url) {
        return decodeURIComponent(
            url
                .replace(/%21/g, '!')
                .replace(/%27/g, '\'')
                .replace(/%28/g, '(')
                .replace(/%29/g, ')')
                .replace(/%2A/g, '*')
                .replace(/%7E/g, '~')
                .replace(/_/g, '%20')
                .replace(/:/g, '%3A')
                .replace(/\//g, '%2F')
        );
    }
    /**
     * Decodes HTML.
     * Reverse of mw.html.encode.
     * @param {String} html HTML to decode
     * @returns {String} Decoded HTML
     * @static
     */
    static decodeHTML(html) {
        return String(html)
            .replace(/&#0?39;/g, '\'')
            .replace(/&#0?10;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }
    /**
     * Capitalizes the first letter in a string.
     * @param {String} str String to capitalize
     * @returns {String} String with the first letter capitalized
     * @static
     */
    static cap(str) {
        return `${str.charAt(0).toUpperCase()}${str.substring(1)}`;
    }
    /**
     * Checks if a string is an IP range.
     * @param {String} str String to check
     * @returns {Boolean} If the supplied string is an IP address/range
     * @static
     */
    static isIPRange(str) {
        const spl = str.split('/');
        if (spl.length !== 2 || !net.isIP(spl[0])) {
            return false;
        }
        // See $wgBlockCIDRLimit configuration variable.
        const cidrLimit = spl[0].includes(':') ? 19 : 16,
              range = Number(spl[1]);
        return !isNaN(range) && range >= cidrLimit;
    }
}

// Share the user agent string between modules.
Util.USER_AGENT = `${pkg.name} v${pkg.version}: ${pkg.description}`;

module.exports = Util;
