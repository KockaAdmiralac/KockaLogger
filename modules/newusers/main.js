/**
 * main.js
 *
 * Main module for the new user creation log and spam profile finder.
 */
'use strict';

/**
 * Importing modules.
 */
const redis = require('redis'),
      Module = require('../module.js'),
      Logger = require('../../include/log.js'),
      util = require('../../include/util.js'),
      Discord = require('../../transports/discord/main.js'),
      mysql = require('mysql2/promise');

/**
 * Constants.
 */
const QUERY = 'INSERT INTO `newusers` (`name`, `wiki`, `language`, `domain`) ' +
              'VALUES(?, ?, ?, ?)',
/* eslint-disable camelcase, sort-keys */
PROPERTY_MAP = {
    website: 'Website',
    name: 'aka',
    location: 'I live in',
    UserProfilePagesV3_birthday: 'I was born on',
    UserProfilePagesV3_gender: 'I am',
    fbPage: 'Facebook',
    twitter: 'Twitter',
    bio: 'Bio'
},
/* eslint-enable */
PREFIXES = {
    fbPage: 'https://facebook.com/',
    twitter: 'https://twitter.com/'
},
CACHE_EXPIRY = 30 * 60;

/**
 * Module for recording account creations and reporting possible profile spam.
 * @augments Module
 */
class NewUsers extends Module {
    /**
     * Class constructor.
     * @param {Object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        this._initLogger();
        this._initDB(config.db);
        this._initSubscriber();
        this._initTransport(config.transport);
    }
    /**
     * Sets up a logger.
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
     * Initializes the database connection.
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
     * Initializes a new Redis client used for subscribing to key expiry.
     * @private
     */
    _initSubscriber() {
        this._subscriber = redis.createClient({
            path: '/tmp/redis_kockalogger.sock'
        })
        .on('connect', this._redisConnected.bind(this))
        .on('end', this._redisDisconnected.bind(this))
        .on('error', this._redisError.bind(this))
        .on('reconnecting', this._redisReconnecting.bind(this))
        .on('message', this._redisMessage.bind(this));
        this._subscriber.subscribe('__keyevent@0__:expired');
    }
    /**
     * Event emitted when the Redis client connects.
     * @private
     */
    _redisConnected() {
        this._logger.info('Connected to Redis.');
    }
    /**
     * Event emitted when the Redis client connects.
     * @private
     */
    _redisDisconnected() {
        this._logger.error('Disconnected from Redis.');
    }
    /**
     * Event emitted when an error occurs with Redis.
     * @param {Error} error Error that occurred
     * @private
     */
    _redisError(error) {
        if (error) {
            if (error.code === 'ENOENT') {
                this._logger.error('Redis not started up.');
            } else {
                this._logger.error('Redis error:', error);
            }
        }
    }
    /**
     * Event emitted when Redis starts attempting to reconnect.
     * @private
     */
    _redisReconnecting() {
        this._logger.warn('Redis is reconnecting...');
    }
    /**
     * Initializes the Discord transport.
     * @param {Object} config Transport configuration
     * @private
     */
    _initTransport(config) {
        if (typeof config !== 'object') {
            throw new Error('Discord configuration is invalid!');
        }
        config.type = 'discord-newusers';
        this._transport = new Discord(config);
    }
    /**
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} message Message to check
     * @returns {Boolean} Whether the module is interested in receiving
     */
    interested(message) {
        return message.type === 'log' && message.log === 'newusers';
    }
    /**
     * Handles messages.
     * @param {Message} message Message to handle
     */
    execute(message) {
        this._db.getConnection().then(function(db) {
            db.execute(QUERY, [
                message.user,
                message.wiki,
                message.language,
                message.domain
            ]);
            db.release();
        }).catch(e => this._logger.error('Query error', e));
        const key = `newusers:${message.user}:${message.wiki}:${message.language}:${message.domain}`;
        this._cache
            .batch()
            .setbit(key, 0, 1)
            .expire(key, CACHE_EXPIRY)
            .exec(this._redisCallback.bind(this));
    }
    /**
     * Callback after a key expires in Redis.
     * @param {String} channel Subscription channel
     * @param {String} message Message sent in the channel
     * @private
     */
    _redisMessage(channel, message) {
        const [type, user, wiki, language, domain] = message.split(':');
        if (channel !== '__keyevent@0__:expired' || type !== 'newusers') {
            return;
        }
        this._io.query('community', 'en', 'fandom.com', {
            list: 'users',
            ususers: user
        }).then(function(result) {
            if (
                typeof result === 'object' &&
                typeof result.query === 'object' &&
                result.query.users instanceof Array &&
                typeof result.query.users[0] === 'object' &&
                typeof result.query.users[0].userid === 'number'
            ) {
                this._getInfo(
                    result.query.users[0].userid,
                    wiki,
                    language,
                    domain
                );
            } else if (!user.startsWith('QATest')) {
                this._logger.error(
                    'Failed to fetch user ID for',
                    user, ':', result
                );
            }
        }.bind(this)).catch(e => this._logger.error('MediaWiki API error', e));
    }
    /**
     * Gets profile information about a specified user.
     * @param {Number} id User ID of the user
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     * @param {String} domain Domain of the wiki
     */
    _getInfo(id, wiki, language, domain) {
        this._io.userInfo(id).then(function(json) {
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
                    this._post(info, wiki, language, domain);
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
     * Posts profile information to a Discord channel.
     * @param {Object} info User information
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     * @param {String} domain Domain of the wiki
     */
    _post(info, wiki, language, domain) {
        const message = {
            fields: [],
            title: info.username,
            url: `${util.url(
                wiki === 'www' ? 'c' : wiki,
                language,
                domain
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
        this._transport.execute({
            content: `\`!report p ${
                wiki === 'www' || wiki === 'community' ? 'c' : wiki
            } ${info.username}\``,
            embeds: [message]
        });
    }
}

module.exports = NewUsers;
