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
const {MessageComponentTypes} = require('discord-interactions');
const mysql = require('mysql2/promise');
const StagingArea = require('./staging.js');

const INSERT_USER_QUERY = 'INSERT INTO `newusers` (`name`, `wiki`, ' +
    '`language`, `domain`) VALUES(?, ?, ?, ?)';
const INSERT_PROFILE_QUERY = 'INSERT INTO `profiles` (`id`, `name`, ' +
    '`website`, `aka`, `facebook`, `twitter`, `discord`, `bio`) VALUES ' +
    '(?, ?, ?, ?, ?, ?, ?, ?)';
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
     * Discord transport for profile logs.
     * @type {Discord}
     */
    #profilesTransport = null;
    /**
     * Discord transport for new user logs.
     * @type {Discord}
     */
    #logTransport = null;
    /**
     * Database queries left to finish before killing this module.
     * @type {number}
     */
    #noCloseConnection = 0;
    /**
     * This module's logger.
     * @type {Logger}
     */
    #logger = this.#initLogger();
    /**
     * This module's database connection.
     * @type {mysql.Pool}
     */
    #db = null;
    /**
     * This module's Redis subscriber.
     * @type {Redis}
     */
    #subscriber = null;
    /**
     * Whether the module is currently being killed.
     * @type {boolean}
     */
    #killing = false;
    /**
     * Discord interactions handler.
     * @type {import('./server.js')|null}
     */
    #server = null;
    /**
     * Staging area controls.
     * @type {StagingArea|null}
     */
    #staging = null;
    /**
     * Class constructor.
     * @param {object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        const {
            db, profiles, transport, log, publicKey, port, staging
        } = config;
        this.#initLogger();
        this.#db = this.#initDB(db);
        this.#subscriber = this.#initSubscriber();
        const profilesConf = profiles || transport;
        this.#profilesTransport = this.#initTransport(profilesConf, 'profiles');
        this.#logTransport = this.#initTransport(log, 'log');
        if (staging) {
            this.#staging = new StagingArea(this._cache, staging);
        }
        if (publicKey) {
            const NewUsersServer = require('./server.js');
            this.#server = new NewUsersServer(
                port,
                publicKey,
                this.#db,
                profilesConf,
                this.#staging
            );
        }
    }
    /**
     * Sets up the staging area.
     * @param {...any} args Arguments to the superclass method
     */
    async setup(...args) {
        super.setup(...args);
        if (this.#staging) {
            await this.#staging.setup();
        }
    }
    /**
     * Sets up a logger.
     * @returns {Logger} Logger
     */
    #initLogger() {
        return new Logger({
            file: true,
            name: 'newusers',
            stdout: true
        });
    }
    /**
     * Initializes the database connection.
     * @param {object} config Database configuration
     * @returns {mysql.Pool} Database connection
     */
    #initDB(config) {
        return mysql.createPool({
            connectionLimit: config.limit || 100,
            database: config.db || 'wikia',
            debug: false,
            host: config.host || 'localhost',
            password: config.password,
            user: config.user
        });
    }
    /**
     * Creates a new Redis client used for subscribing to key expiry.
     * @returns {Redis} Redis client
     */
    #initSubscriber() {
        // WARNING: Risky! `Redis#options` undocumented.
        const subscriber = new Redis(this._cache.options)
            .on('connect', this.#redisConnected.bind(this))
            .on('end', this.#redisDisconnected.bind(this))
            .on('error', this.#redisError.bind(this))
            .on('reconnecting', this.#redisReconnecting.bind(this))
            .on('message', this.#redisMessage.bind(this));
        subscriber.subscribe('__keyevent@0__:expired');
        return subscriber;
    }
    /**
     * Event emitted when the Redis client connects.
     */
    #redisConnected() {
        this.#logger.info('Connected to Redis.');
    }
    /**
     * Event emitted when the Redis client connects.
     */
    #redisDisconnected() {
        if (!this.#killing) {
            this.#logger.error('Disconnected from Redis.');
        }
    }
    /**
     * Event emitted when an error occurs with Redis.
     * @param {Error} error Error that occurred
     */
    #redisError(error) {
        if (error) {
            if (error.code === 'ENOENT') {
                this.#logger.error('Redis not started up.');
            } else {
                this.#logger.error('Redis error:', error);
            }
        }
    }
    /**
     * Event emitted when Redis starts attempting to reconnect.
     */
    #redisReconnecting() {
        this.#logger.warn('Redis is reconnecting...');
    }
    /**
     * Initializes a Discord transport instance.
     * Currently shared by two instance initializations:
     * - `log`: Transport where all new users are logged.
     * - `profiles`: Transport where possible spam profiles are logged.
     * @param {object} config Transport configuration
     * @param {string} name Transport name
     * @returns {Discord} Discord transport
     * @throws {Error} If the transport configuration is not an object
     */
    #initTransport(config, name) {
        if (typeof config !== 'object') {
            throw new Error('Discord configuration is invalid!');
        }
        config.type = `discord-newusers-${name}`;
        return new Discord(config);
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
        if (this.#killing) {
            return;
        }
        await this.#relay(message);
        try {
            await this.#insertUser(message);
        } catch (error) {
            this.#logger.error('Query error', error);
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
     */
    async #relay(message) {
        const {wiki, language, domain, user} = message;
        const wikiUrl = url(wiki, language, domain);
        await this.#logTransport.execute({
            content: `[${user}](<${wikiUrl}/wiki/Special:Contribs/${encode(user)}>) ([talk](<${wikiUrl}/wiki/User_talk:${encode(user)}>) | [${
                shorturl(wiki, language, domain)
            }](<${wikiUrl}/wiki/Special:Log/newusers>))`
        });
    }
    /**
     * Inserts a user into the database, provided a connection.
     * @param {Message} message New user information
     */
    async #insertUser(message) {
        ++this.#noCloseConnection;
        const {user, wiki, language, domain} = message;
        await this.#db.execute(INSERT_USER_QUERY, [
            user,
            wiki,
            language,
            domain
        ]);
        if (--this.#noCloseConnection === 0 && this.#killing) {
            await this.#db.end();
        }
    }
    /**
     * Inserts a user's profile information into a database.
     * @param {number} id User's ID
     * @param {object} info User information
     */
    async #insertProfile(id, info) {
        ++this.#noCloseConnection;
        const {
            bio, discordHandle, fbPage, name, twitter, username, website
        } = info;
        await this.#db.execute(INSERT_PROFILE_QUERY, [
            id,
            username,
            (website || '').slice(0, 255) || null,
            (name || '').slice(0, 64) || null,
            (fbPage || '').slice(0, 255) || null,
            (twitter || '').slice(0, 255) || null,
            (discordHandle || '').slice(0, 64) || null,
            bio || null
        ]);
        if (--this.#noCloseConnection === 0 && this.#killing) {
            await this.#db.end();
        }
    }
    /**
     * Callback after a key expires in Redis.
     * @param {string} channel Subscription channel
     * @param {string} message Message sent in the channel
     */
    async #redisMessage(channel, message) {
        const [type, user, wiki, language, domain] = message.split(':');
        if (channel !== '__keyevent@0__:expired' || type !== 'newusers') {
            return;
        }
        const wait = promisify(setTimeout);
        const errors = [];
        for (let retry = 0; retry < MAX_RETRIES; ++retry) {
            await wait(retry * RETRY_DELAY);
            try {
                const userId = await this.#getID(user, wiki, language, domain);
                const {users} = await this._io.userInfo(userId);
                const userData = users[userId];
                const {bio, discordHandle, fbPage, twitter, website} = userData;
                if (bio || discordHandle || fbPage || twitter || website) {
                    await this.#insertProfile(userId, userData);
                    await this.#post(userId, userData, wiki, language, domain);
                }
                return;
            } catch (error) {
                if (user.startsWith('QATest')) {
                    return;
                }
                errors.push(error);
            }
        }
        this.#logger.error(`Errors while fetching user ID (${message}):`, ...errors);
    }
    /**
     * Fetches a user's ID.
     * This method needs to fail if it wants the parent loop to retry
     * the request.
     * @param {string} user User whose ID is being obtained
     * @returns {Promise<number>} The user's ID
     */
    async #getID(user) {
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
     * @param {number} userId Fandom user ID
     * @param {object} info User information
     * @param {string} wiki Wiki the user created their account on
     * @param {string} language Language path of the wiki
     * @param {string} domain Domain of the wiki
     */
    async #post(userId, info, wiki, language, domain) {
        await this.#profilesTransport.execute({
            components: this.#server ? [{
                components: [
                    {
                        // eslint-disable-next-line camelcase
                        custom_id: `spam-${userId}`,
                        label: 'Spam',
                        style: 3,
                        type: MessageComponentTypes.BUTTON
                    },
                    {
                        // eslint-disable-next-line camelcase
                        custom_id: `notspam-${userId}`,
                        label: 'Not spam',
                        style: 4,
                        type: MessageComponentTypes.BUTTON
                    }
                ],
                type: MessageComponentTypes.ACTION_ROW
            }] : undefined,
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
        this.#killing = true;
        this.#logger.close();
        this.#profilesTransport.kill();
        this.#logTransport.kill();
        if (this.#staging) {
            this.#staging.kill();
        }
        if (this.#server) {
            this.#server.kill();
        }
        // Close database connection when there are no pending queries.
        if (this.#noCloseConnection === 0) {
            await this.#db.end();
        }
        await promisify(this.#subscriber.quit).call(this.#subscriber);
    }
}

module.exports = NewUsers;
