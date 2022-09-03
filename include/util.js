/**
 * util.js
 *
 * Module for shared utilities throughout the project.
 */
'use strict';

const net = require('net');
const {escapeMarkdown} = require('discord.js');
const pkg = require('../package.json');

/**
 * Class for shared utilities through the project.
 */
class Util {
    /**
     * Returns a Fandom wiki URL.
     * @param {string} wiki Subdomain of the wiki
     * @param {string} lang Language of the wiki
     * @param {string} domain Domain of the wiki
     * @returns {string} URL to the requested wiki
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
     * @param {string} wiki Subdomain of the wiki
     * @param {string} lang Language of the wiki
     * @param {string} domain Domain of the wiki
     * @returns {string} URL to the requested wiki (protocol-less)
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
     * @param {string} text Markdown to escape
     * @returns {string} Escaped parameter
     * @static
     */
    static escape(text) {
        return escapeMarkdown(
            text
                // Escape links.
                .replace(/(https?):\/\//ug, '$1:/\u200B/')
                // Escape invite links.
                .replace(/discord\.gg/ug, 'discord\u200B.\u200Bgg')
                // Remove line breaks.
                .replace(/\r?\n|\r/ug, '')
                // Escape Markdown escape sequences
                .replace(/\\/ug, '\\\\'),
            {
                inlineCode: false,
                strikethrough: false
            }
        );
    }
    /**
     * Escapes a string from special regex characters.
     * @param {string} text String to escape
     * @returns {string} String with special regex characters escaped
     * @static
     * @see https://stackoverflow.com/a/3561711
     */
    static escapeRegex(text) {
        return text.replace(/[-/\\^$*+?.()|[\]{}]/ug, '\\$&');
    }
    /**
     * Encodes URL components MediaWiki-style.
     * Based on mw.util.wikiUrlencode.
     * @param {string} url URL to encode
     * @returns {string} Encoded URL
     * @static
     */
    static encode(url) {
        return encodeURIComponent(url)
            .replace(/!/ug, '%21')
            .replace(/'/ug, '%27')
            .replace(/\(/ug, '%28')
            .replace(/\)/ug, '%29')
            .replace(/\*/ug, '%2A')
            .replace(/~/ug, '%7E')
            .replace(/%20/ug, '_')
            .replace(/%3A/ug, ':')
            .replace(/%2F/ug, '/');
    }
    /**
     * Decodes URL components MediaWiki-style.
     * @param {string} url URL to decode
     * @returns {string} Decoded URL
     * @static
     */
    static decode(url) {
        return decodeURIComponent(
            url
                .replace(/%21/ug, '!')
                .replace(/%27/ug, '\'')
                .replace(/%28/ug, '(')
                .replace(/%29/ug, ')')
                .replace(/%2A/ug, '*')
                .replace(/%7E/ug, '~')
                .replace(/_/ug, '%20')
                .replace(/:/ug, '%3A')
                .replace(/\//ug, '%2F')
        );
    }
    /**
     * Decodes HTML.
     * Reverse of mw.html.encode.
     * @param {string} html HTML to decode
     * @returns {string} Decoded HTML
     * @static
     */
    static decodeHTML(html) {
        return String(html)
            .replace(/&#0?39;/ug, '\'')
            .replace(/&#0?10;/ug, ' ')
            .replace(/&quot;/ug, '"')
            .replace(/&lt;/ug, '<')
            .replace(/&gt;/ug, '>')
            .replace(/&amp;/ug, '&');
    }
    /**
     * Capitalizes the first letter in a string.
     * @param {string} str String to capitalize
     * @returns {string} String with the first letter capitalized
     * @static
     */
    static cap(str) {
        return `${str.charAt(0).toUpperCase()}${str.substring(1)}`;
    }
    /**
     * Checks if a string is an IP range.
     * @param {string} str String to check
     * @returns {boolean} If the supplied string is an IP address/range
     * @static
     */
    static isIPRange(str) {
        const spl = str.split('/');
        if (spl.length !== 2 || !net.isIP(spl[0])) {
            return false;
        }
        // See $wgBlockCIDRLimit configuration variable.
        const cidrLimit = spl[0].includes(':') ? 19 : 16;
        const range = Number(spl[1]);
        return !isNaN(range) && range >= cidrLimit;
    }
}

// Share the user agent string between modules.
Util.USER_AGENT = `${pkg.name} v${pkg.version}: ${pkg.description}`;

module.exports = Util;
