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
CACHE_EXPIRY = 30 * 60,
MAX_RETRIES = 5,
RETRY_DELAY = 10000;

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
        this._retries = [];
        this._retryCount = {};
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
        if (!this._killing) {
            this._logger.error('Disconnected from Redis.');
        }
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
        if (channel === '__keyevent@0__:expired' && type === 'newusers') {
            this._getID(user, wiki, language, domain);
        }
    }
    /**
     * Fetches a user's ID.
     * @param {String} user User whose ID is being obtained
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     * @param {String} domain Domain of the wiki
     * @param {Boolean} isRetry If the function was called as a retry
     * @private
     */
    _getID(user, wiki, language, domain, isRetry) {
        try {
            if (isRetry) {
                this._retries.shift();
            }
            this._io.query('community', 'en', 'fandom.com', {
                list: 'users',
                ususers: user
            }).then(this._idCallback.bind(this, user, wiki, language, domain))
            .catch(this._idError.bind(this, user, wiki, language, domain));
        } catch (error) {
            this._logger.error(
                'Error in timeout for obtaining user ID:',
                error
            );
        }
    }
    /**
     * Callback after obtaining a user ID.
     * @param {String} user User whose ID is being obtained
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     * @param {String} domain Domain of the wiki
     * @param {Object} result MediaWiki API response
     * @private
     */
    _idCallback(user, wiki, language, domain, result) {
        try {
            if (
                typeof result === 'object' &&
                typeof result.query === 'object' &&
                result.query.users instanceof Array &&
                typeof result.query.users[0] === 'object' &&
                typeof result.query.users[0].userid === 'number'
            ) {
                if (result.isRetry) {
                    this._retries.shift();
                }
                const id = result.query.users[0].userid;
                delete this._retryCount[user];
                const message = {
                    domain,
                    id,
                    language,
                    user,
                    wiki
                };
                this._io.userInfo(id)
                    .then(this._infoCallback.bind(this, message))
                    .catch(this._infoError.bind(this, message));
            } else if (!user.startsWith('QATest')) {
                this._idError(user, wiki, language, domain, result);
            }
        } catch (error) {
            this._logger.error(
                'Error in timeout for obtaining user information:',
                error
            );
        }
    }
    /**
     * Callback after failing to obtain a user ID.
     * @param {String} user User whose ID was being obtained
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     * @param {String} domain Domain of the wiki
     * @param {Error} error Error that occurred
     * @private
     */
    _idError(user, wiki, language, domain, error) {
        if (this._retryCount[user] && this._retryCount[user] === MAX_RETRIES) {
            this._logger.error('Failed to fetch user ID:', error);
        } else {
            if (!this._retryCount[user]) {
                this._retryCount[user] = 0;
            }
            this._retries.push(setTimeout(
                this._getID.bind(this, user, wiki, language, domain, true),
                ++this._retryCount[user] * RETRY_DELAY
            ));
        }
    }
    /**
     * Callback after getting profile information about a user.
     * @param {Number} id User ID of the user
     * @param {String} json JSON response with profile information
     * @param {String} user Username of the user
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     * @param {String} domain Domain of the wiki
     */
    _infoCallback({id, user, wiki, language, domain}, json) {
        let data = null;
        const message = {
            domain,
            id,
            language,
            user,
            wiki
        };
        try {
            data = JSON.parse(json);
        } catch (error) {
            this._infoError(message, {
                details: 'JSON parsing error.',
                error,
                json
            });
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
            this._infoError(message, data);
        }
    }
    /**
     * Callback after getting profile information about a user.
     * @param {Number} id User ID of the user
     * @param {Error} error Error that occurred
     * @param {String} wiki Wiki the user created their account on
     * @param {String} language Language path of the wiki
     * @param {String} domain Domain of the wiki
     * @private
     * @todo DRY
     */
    _infoError({id, user, wiki, language, domain}, error) {
        if (this._retryCount[user] && this._retryCount[user] === MAX_RETRIES) {
            this._logger.error('Failed to fetch user information:', error);
        } else {
            if (!this._retryCount[user]) {
                this._retryCount[user] = 0;
            }
            this._retries.push(setTimeout(
                // WARNING: Hacky!
                this._idCallback.bind(this, user, wiki, language, domain, {
                    isRetry: true,
                    query: {
                        users: [
                            {
                                userid: id
                            }
                        ]
                    }
                }),
                ++this._retryCount[user] * RETRY_DELAY
            ));
        }
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
                wiki === 'www' ||
                wiki === 'community' ?
                    'c' :
                    util.shorturl(wiki, language, domain)
            } ${info.username}\``,
            embeds: [message]
        });
    }
    /**
     * Cleans up the resources after a kill has been requested.
     * @param {Function} callback Callback to call after cleaning up
     * @returns {Number} Number of upcoming callback calls
     */
    kill(callback) {
        this._killing = true;
        this._retries.forEach(clearTimeout);
        this._logger.close(callback);
        this._db.end().then(callback);
        this._subscriber.quit(callback);
        return 3;
    }
}

module.exports = NewUsers;
