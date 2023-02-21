/**
 * main.js
 *
 * Module for the Discussions format.
 */
'use strict';

const Format = require('../format.js');
const {cap, encode, url, shorturl} = require('../../include/util.js');
const Message = require('../../parser/msg.js');

const COLOR = {
    post: 0x00FF00,
    report: 0xFF0000,
    thread: 0xFFFF00
};
const P_REGEX = /^<p>(.*)(?:<\/p>)?$/u;

/**
 * Main class.
 * @augments Format
 */
class DiscussionsFormat extends Format {
    /**
     * Main class method.
     * @param {Message} msg Message to format
     * @returns {object|null} Formatted embed, if possible to format
     */
    execute(msg) {
        if (
            msg.type !== 'discussions' ||
            msg.platform !== 'discussion' ||
            this._transport.constructor.name !== 'Discord'
        ) {
            return null;
        }
        return {
            embeds: [
                {
                    author: {
                        name: `${msg.user} [${shorturl(msg.wiki, msg.language, msg.domain)}]`,
                        url: `${url(msg.wiki, msg.language, msg.domain)}/wiki/Special:Contribs/${encode(msg.user)}`
                    },
                    color: COLOR[msg.dtype],
                    description: msg.snippet.trim().replace(P_REGEX, '$1'),
                    title: msg.title ?
                        `${msg.title} [${cap(msg.dtype)} ${msg.action}]` :
                        `${cap(msg.dtype)} ${msg.action}`,
                    url: msg.url
                }
            ]
        };
    }
}

module.exports = DiscussionsFormat;
