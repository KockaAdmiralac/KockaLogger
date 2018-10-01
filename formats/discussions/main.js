/**
 * main.js
 *
 * Module for the Discussions format
 */
'use strict';

/**
 * Importing modules
 */
const Format = require('../format.js'),
      util = require('../../include/util.js');

/**
 * Constants
 */
const COLOR = {
    post: 0x00FF00,
    report: 0xFF0000,
    thread: 0xFFFF00
};

/**
 * Main class
 * @augments Format
 */
class DiscussionsFormat extends Format {
    /**
     * Main class method
     * @param {Message} msg Message to format
     * @returns {Object} Formatted embed
     */
    execute(msg) {
        if (
            msg.type !== 'discussions' ||
            this._transport.constructor.name !== 'Discord'
        ) {
            return;
        }
        return {
            embeds: [
                {
                    author: {
                        // TODO: Change when HTTPS is released globally
                        name: `${msg.user} [${msg.wiki}]`,
                        url: `${util.url(msg.wiki, msg.language)}/wiki/Special:Contribs/${util.encode(msg.user)}`
                    },
                    color: COLOR[msg.dtype],
                    description: msg.snippet,
                    title: msg.title ?
                        `${msg.title} [${util.cap(msg.dtype)} ${msg.action}]` :
                        `${util.cap(msg.dtype)} ${msg.action}`,
                    url: msg.url
                }
            ]
        };
    }
}

module.exports = DiscussionsFormat;
