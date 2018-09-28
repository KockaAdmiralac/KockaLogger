/**
 * main.js
 *
 * Main module for the newusers module
 */
'use strict';

/**
 * Importing modules
 */
const Module = require('../module.js'),
      Logger = require('../../include/log.js'),
      Cache = require('../../include/cache.js'),
      io = require('../../include/io.js'),
      util = require('../../include/util.js'),
      Discord = require('../../transports/discord/main.js'),
      mysql = require('mysql2/promise');

/**
 * Constants
 */
const QUERY = 'INSERT INTO `newusers` (`name`, `wiki`, `language`) ' +
              'VALUES(?, ?, ?)',
/* eslint-disable */
PROPERTY_MAP = {
    website: 'Website',
    name: 'aka',
    location: 'I live in',
    UserProfilePagesV3_birthday: 'I was born on',
    UserProfilePagesV3_gender: 'I am',
    fbPage: 'Facebook',
    twitter: 'Twitter',
    bio: 'Bio'
}, /* eslint-enable */ PREFIXES = {
    fbPage: 'https://facebook.com/',
    twitter: 'https://twitter.com/'
};

/**
 * New users module class
 */
class NewUsers extends Module {
    /**
     * Class constructor
     * @param {Object} config Module configuration
     */
    constructor(config) {
        super(config);
        this._initLogger();
        this._initDB(config.db);
        this._initCache();
        this._initTransport(config.transport);
    }
    /**
     * Sets up a logger
     * @private
     */
    _initLogger() {
        this._logger = new Logger({
            file: true,
            name: 'newusers',
            stdout: true
        });
    }
    /**
     * Initializes the database connection
     * @param {Object} config Database configuration
     * @private
     */
    _initDB(config) {
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
     * Initializes cache
     * @private
     */
    _initCache() {
        this._cache = new Cache({
            check: 60000,
            expiry: 30 * 60 * 1000,
            name: 'profiles',
            pop: this._pop.bind(this),
            save: 60000
        });
        this._cache.load();
    }
    /**
     * Initializes the Discord transport
     * @param {Object} config Transport configuration
     * @private
     */
    _initTransport(config) {
        if (typeof config !== 'object') {
            throw new Error('Discord configuration invalid!');
        }
        config.type = 'discord-newusers';
        this._transport = new Discord(config);
    }
    /**
     * Handles messages
     * @param {Message} message Message to handle
     */
    execute(message) {
        if (message.type === 'log' && message.log === 'newusers') {
            this._insert(message.user, message.wiki, message.language);
        }
    }
    /**
     * Inserts a new user into the database and cache
     * @param {String} user User to insert
     * @param {String} wiki Wiki of account creation
     * @param {String} language Language path of the wiki
     * @private
     */
    _insert(user, wiki, language) {
        this._db.getConnection().then(function(db) {
            db.execute(QUERY, [user, wiki, language]);
            db.release();
        }).catch(e => this._logger.error('Query error', e));
        this._cache.set(user, [wiki, language]);
    }
    /**
     * Gets called when an entry is removed from cache
     * @param {String} key Key for the entry
     * @param {String} value Value for the entry
     * @private
     */
    _pop(key, [wiki, language]) {
        io.query('community', 'en', {
            list: 'users',
            ususers: key
        }).then(function(result) {
            if (
                typeof result === 'object' &&
                typeof result.query === 'object' &&
                result.query.users instanceof Array &&
                typeof result.query.users[0] === 'object' &&
                typeof result.query.users[0].userid === 'number'
            ) {
                this._getInfo(result.query.users[0].userid, wiki, language);
            } else if (!key.startsWith('QATest')) {
                this._logger.error(
                    'MediaWiki API failed to fetch user ID for',
                    key, ':', result
                );
            }
        }.bind(this)).catch(e => this._logger.error('MediaWiki API error', e));
    }
    /**
     * Gets profile information about a specified user
     * @param {Number} id User ID of the user
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     */
    _getInfo(id, wiki, language) {
        io.userInfo(id).then(function(json) {
            let data = null;
            try {
                data = JSON.parse(json);
            } catch (e) {
                this._logger.error('JSON parsing error', e, json);
                return;
            }
            if (
                typeof data === 'object' &&
                typeof data.users === 'object' &&
                typeof data.users[id] === 'object'
            ) {
                const info = data.users[id];
                if (info.website) {
                    this._post(info, wiki, language);
                }
            } else {
                this._logger.error(
                    'Service API returned invalid data for user ID',
                    id, ':', data
                );
            }
        }.bind(this)).catch(e => this._logger.error('Service API error', e));
    }
    /**
     * Posts profile information to a Discord channel
     * @param {Object} info User information
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     */
    _post(info, wiki, language) {
        const message = {
            fields: [],
            title: info.username,
            url: `${util.url(
                wiki === 'www' ? 'c' : wiki,
                language
            )}/wiki/Special:Contribs/${util.encode(info.username)}`
        };
        if (info.avatar) {
            message.image = {
                url: info.avatar
            };
        }
        for (const key in PROPERTY_MAP) {
            if (info[key]) {
                message.fields.push({
                    inline: true,
                    name: PROPERTY_MAP[key],
                    value: PREFIXES[key] ?
                        PREFIXES[key] + info[key] :
                        info[key]
                });
            }
        }
        message.fields.push({
            inline: true,
            name: 'Report',
            value: `\`!report p ${
                wiki === 'www' || wiki === 'community' ? 'c' : wiki
            } ${info.username}\``
        });
        this._transport.execute({embeds: [message]});
    }
}

module.exports = NewUsers;
