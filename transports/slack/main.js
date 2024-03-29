/**
 * main.js
 *
 * Main module for the Slack transport.
 */
'use strict';

const Transport = require('../transport.js');
const got = require('got');

const PREFIX = 'https://hooks.slack.com/services/';

/**
 * Slack transport class.
 * @augments Transport
 */
class Slack extends Transport {
    /**
     * Class constructor.
     * @param {object} config Transport configuration
     */
    constructor(config) {
        super(config);
        const {url} = config;
        if (
            typeof url !== 'string' ||
            !url.startsWith(PREFIX) ||
            url.split('/').length !== 7
        ) {
            throw new Error('Invalid Slack transport configuration!');
        }
        this._url = url;
    }
    /**
     * Executes the transport.
     * @param {object} message Formatted message to transport
     */
    async execute(message) {
        try {
            await got(this._url, {
                body: message,
                method: 'POST'
            });
        } catch (error) {
            this._logger.error('Slack transport error:', error);
        }
    }
}

module.exports = Slack;
