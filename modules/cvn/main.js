/**
 * main.js
 *
 * Main script for the CVN module
 */
'use strict';

/**
 * Importing modules
 */
const irc = require('irc-upd'),
      mysql = require('mysql2/promise'),
      Module = require('../module.js'),
      Logger = require('../../include/log.js');

/**
 * Constants
 */
const EVENTS = [
    'registered',
    'join',
    'error',
    'message'
];

/**
 * Main class for the CVN module
 * @augments Module
 */
class CVN extends Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        this._initClient(config.client);
        this._initDatabase(config.db);
        this._initLogger();
    }
    /**
     * Initializes the Freenode client
     * @param {Object} config Client configuration
     * @private
     */
    _initClient(config) {
        this._client = new irc.Client('chat.freenode.net', config.nick, {
            channels: [config.channel],
            password: config.password,
            realName: config.realname,
            sasl: true,
            userName: config.username || config.nick
        });
        EVENTS.forEach(function(e) {
            this._client.on(e, this[`_${e}`].bind(this));
        }, this);
    }
    /**
     * Initializes a database connection
     * @param {Object} config Database configuration
     * @private
     */
    _initDatabase(config) {
        this._db = mysql.createPool({
            connectionLimit: config.limit || 100,
            database: config.db || 'wikia',
            debug: false,
            host: config.host || 'localhost',
            password: config.password,
            user: config.user
        });
    }
    /**
     * Initializes logging in the module
     * @private
     */
    _initLogger() {
        this._logger = new Logger({
            file: true,
            name: 'cvn',
            stdout: true
        });
    }
    /**
     * Event called upon joining the IRC server
     * @private
     */
    _registered() {
        this._logger.info('Joined Freenode...');
    }
    /**
     * Event called upon joining an IRC channel
     * @param {String} channel Channel that was joined
     * @param {String} user User that joined the channel
     */
    _join(channel, user) {
        if (channel === this._config.client.channel) {
            if (user === this._config.client.nick) {
                this._logger.info('Joined the CVN channel!');
            } else {
                this._logger.info(user, 'joined the CVN channel');
            }
        } else if (user === this._config.client.nick) {
            this._logger.error('Misjoined', channel);
        }
    }
}

module.exports = CVN;
