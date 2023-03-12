/**
 * main.js
 *
 * Main module for the new user creation log and spam profile finder.
 */
'use strict';

const {promisify} = require('util');
const Redis = require('ioredis');
const Client = require('../../include/client.js');
const Message = require('../../parser/msg.js');
const Module = require('../module.js');
const Logger = require('../../include/log.js');
const {url, shorturl, encode} = require('../../include/util.js');
const Discord = require('../../transports/discord/main.js');
const mysql = require('mysql2/promise');

const QUERY = 'INSERT INTO `newusers` (`name`, `wiki`, `language`, `domain`) ' +
              'VALUES(?, ?, ?, ?)';
/* eslint-disable sort-keys */
const PROPERTY_MAP = {
    website: 'Website',
    bio: 'Bio',
    name: 'aka',
    fbPage: 'Facebook',
    twitter: 'Twitter',
    discordHandle: 'Discord'
};
/* eslint-enable */
const PREFIXES = {
    fbPage: 'https://www.facebook.com/',
    twitter: 'https://twitter.com/'
};
const CACHE_EXPIRY = 30 * 60;
const MAX_RETRIES = 5;
const RETRY_DELAY = 10000;

/**
 * Module for recording account creations and reporting possible profile spam.
 * @augments Module
 */
class NewUsers extends Module {
    /**
     * Class constructor.
     * @param {object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        this._initLogger();
        this._initDB(config.db);
        this._initSubscriber();
        this._initTransport(config.profiles || config.transport, 'profiles');
        this._initTransport(config.log, 'log');
        this._noCloseConnection = 0;
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
     * @param {object} config Database configuration
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
        // WARNING: Risky! `Redis#options` undocumented.
        this._subscriber = new Redis(this._cache.options)
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
     * Initializes a Discord transport instance.
     * Currently shared by two instance initializations:
     * - `log`: Transport where all new users are logged.
     * - `profiles`: Transport where possible spam profiles are logged.
     * @param {object} config Transport configuration
     * @param {string} name Transport name
     * @throws {Error} If the transport configuration is not an object
     * @private
     */
    _initTransport(config, name) {
        if (typeof config !== 'object') {
            throw new Error('Discord configuration is invalid!');
        }
        config.type = `discord-newusers-${name}`;
        this[`_${name}Transport`] = new Discord(config);
    }
    /**
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} message Message to check
     * @returns {boolean} Whether the module is interested in receiving
     */
    interested(message) {
        return message.type === 'log' && message.log === 'newusers';
    }
    /**
     * Handles messages.
     * @param {Message} message Message to handle
     */
    async execute(message) {
        if (this._killing) {
            return;
        }
        await this._relay(message);
        try {
            await this._insertUser(message);
        } catch (error) {
            this._logger.error('Query error', error);
        }
        const key = `newusers:${message.user}:${message.wiki}:${message.language}:${message.domain}`;
        await this._cache
            .multi()
            .setbit(key, 0, 1)
            .expire(key, CACHE_EXPIRY)
            .exec();
    }
    /**
     * Relays all creations in a separate channel for logging new users.
     * @param {Message} message New user information
     * @private
     */
    async _relay(message) {
        const {wiki, language, domain, user} = message;
        const wikiUrl = url(wiki, language, domain);
        await this._logTransport.execute({
            content: `[${user}](<${wikiUrl}/wiki/Special:Contribs/${encode(user)}>) ([talk](<${wikiUrl}/wiki/User_talk:${encode(user)}>) | [${
                shorturl(wiki, language, domain)
            }](<${wikiUrl}/wiki/Special:Log/newusers>))`
        });
    }
    /**
     * Inserts a user into the database, provided a connection.
     * @param {Message} message New user information
     */
    async _insertUser(message) {
        ++this._noCloseConnection;
        const {user, wiki, language, domain} = message;
        await this._db.execute(QUERY, [user, wiki, language, domain]);
        if (--this._noCloseConnection === 0 && this._killing) {
            await this._db.end();
        }
    }
    /**
     * Callback after a key expires in Redis.
     * @param {string} channel Subscription channel
     * @param {string} message Message sent in the channel
     * @private
     */
    async _redisMessage(channel, message) {
        const [type, user, wiki, language, domain] = message.split(':');
        if (channel !== '__keyevent@0__:expired' || type !== 'newusers') {
            return;
        }
        const wait = promisify(setTimeout);
        const errors = [];
        for (let retry = 0; retry < MAX_RETRIES; ++retry) {
            await wait(retry * RETRY_DELAY);
            try {
                const userId = await this._getID(user, wiki, language, domain);
                const {users} = await this._io.userInfo(userId);
                const userData = users[userId];
                const {bio, discordHandle, fbPage, twitter, website} = userData;
                if (bio || discordHandle || fbPage || twitter || website) {
                    await this._post(userData, wiki, language, domain);
                }
                return;
            } catch (error) {
                if (user.startsWith('QATest')) {
                    return;
                }
                errors.push(error);
            }
        }
        this._logger.error(`Errors while fetching user ID (${message}):`, ...errors);
    }
    /**
     * Fetches a user's ID.
     * This method needs to fail if it wants the parent loop to retry
     * the request.
     * @param {string} user User whose ID is being obtained
     * @private
     */
    async _getID(user) {
        return (await this._io.query('community', 'en', 'fandom.com', {
            list: 'users',
            ususers: user
        })).query.users[0].userid;
    }
    /**
     * Prefixes a social media handle with a link to that social media site, and
     * formats the result as a Markdown link.
     * @param {string?} prefix Prefix to use
     * @param {string} info Social media handle
     * @returns {string} Prefixed social media handle
     */
    #formatSocial(prefix, info) {
        if (!prefix) {
            // This is probably not a social profile at all.
            return info;
        }
        if (info.startsWith(prefix)) {
            // The handle is already prefixed.
            const handle = info.replace(prefix, '');
            return `[${handle}](${info})`;
        }
        return `[${info}](${prefix}${info})`;
    }
    /**
     * Posts profile information to a Discord channel.
     * @param {object} info User information
     * @param {string} wiki Wiki the user created their account on
     * @param {string} language Language path of the wiki
     * @param {string} domain Domain of the wiki
     */
    async _post(info, wiki, language, domain) {
        await this._profilesTransport.execute({
            content: `!report p ${
                wiki === 'community' ?
                    'c' :
                    shorturl(wiki, language, domain)
            } ${info.username}`,
            embeds: [{
                fields: Object.keys(PROPERTY_MAP)
                    .filter(key => info[key])
                    .map(key => ({
                        inline: true,
                        name: PROPERTY_MAP[key],
                        value: this.#formatSocial(PREFIXES[key], info[key])
                    })),
                image: info.avatar ? {
                    url: info.avatar
                } : undefined,
                title: info.username,
                url: `${url(wiki, language, domain)}/wiki/Special:Contribs/${encode(info.username)}`
            }]
        });
    }
    /**
     * Cleans up the resources after a kill has been requested.
     */
    async kill() {
        this._killing = true;
        this._logger.close();
        this._profilesTransport.kill();
        this._logTransport.kill();
        // Close database connection when there are no pending queries.
        if (this._noCloseConnection === 0) {
            await this._db.end();
        }
        await promisify(this._subscriber.quit).call(this._subscriber);
    }
}

module.exports = NewUsers;
