/**
 * reports.js
 *
 * Handles all logic related to the profile reports channel and database table.
 */
'use strict';

const {promisify} = require('util');
const {url, encode} = require('../../include/util.js');
const {MessageComponentTypes} = require('discord-interactions');
const {getUserData, isReportable} = require('./util.js');
const Redis = require('ioredis');
const {WebhookClient} = require('discord.js');

const INSERT_PROFILE_QUERY = 'INSERT INTO `profiles` (`id`, `name`, ' +
    '`website`, `aka`, `facebook`, `twitter`, `discord`, `bio`) VALUES ' +
    '(?, ?, ?, ?, ?, ?, ?, ?)';
const UPDATE_PROFILE_QUERY_BASE = 'UPDATE `profiles` SET ' +
    '`is_spam` = ?, ' +
    '`classifying_user` = ?, ' +
    '`classification_date` = ?';
const UPDATE_PROFILE_QUERY_ID = `${UPDATE_PROFILE_QUERY_BASE}
WHERE \`id\` = ?`;
const UPDATE_PROFILE_QUERY_NAME = `${UPDATE_PROFILE_QUERY_BASE}
WHERE \`name\` = ?`;
const UPDATE_ALL_PROFILES = `${UPDATE_PROFILE_QUERY_BASE}
WHERE \`is_spam\` IS NULL`;
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
const REDIS_MESSAGES_KEY = 'newusers-messages';

/**
 * Reports channel: deals with posting reports of users who added their profile
 * information in the spam of 30 minutes after creating their account, handling
 * their classification and subsequent deletion of reports from the channel.
 */
class ReportsChannel {
    /**
     * This module's Redis subscriber.
     * @type {Redis}
     */
    #subscriber = null;
    /**
     * Redis client instance.
     *
     * Two instances are required, because a subscriber cannot execute any other
     * commands once subscribed.
     * @type {Redis}
     */
    #redis = null;
    /**
     * API client.
     * @type {import('../../include/io.js')}
     */
    #io = null;
    /**
     * Webhook for reporting users in the classification channel.
     * @type {WebhookClient}
     */
    #webhook = null;
    /**
     * This module's logger.
     * @type {import('../../include/log.js')}
     */
    #logger = null;
    /**
     * This module's database connection.
     * @type {import('mysql2/promise').Pool}
     */
    #db = null;
    /**
     * Interval to spawn test users in.
     * @type {number}
     */
    #testUserInterval = 0;
    /**
     * Whether a kill has been requested.
     * @type {boolean}
     */
    #killing = false;
    /**
     * Class constructor.
     * @param {import('../../include/io.js')} io API client
     * @param {Redis} redis Redis client
     * @param {import('mysql2/promise').Pool} db This module's database
     * connection
     * @param {import('../../include/log.js')} log This module's logger
     * @param {object} config Reports channel configuration
     */
    constructor(io, redis, db, log, config) {
        this.#io = io;
        this.#redis = redis;
        this.#db = db;
        this.#logger = log;
        this.#webhook = new WebhookClient(config);
        this.#subscriber = this.#initSubscriber();
        if (config.testingUsersDoNotSetMeInProduction) {
            this.#testUserInterval = setInterval(
                this.#insertTestUser.bind(this),
                config.testingUsersDoNotSetMeInProduction
            );
        }
    }
    /**
     * Creates a new Redis client used for subscribing to key expiry.
     * @returns {Redis} Redis subscriber
     */
    #initSubscriber() {
        // WARNING: Risky! `Redis#options` undocumented.
        const subscriber = new Redis(this.#redis.options)
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
        this.#logger.info('Connected to Redis (subscriber).');
    }
    /**
     * Event emitted when the Redis client connects.
     */
    #redisDisconnected() {
        if (!this.#killing) {
            this.#logger.error('Disconnected from Redis (subscriber).');
        }
    }
    /**
     * Event emitted when an error occurs with Redis.
     * @param {Error} error Error that occurred
     */
    #redisError(error) {
        if (error) {
            if (error.code === 'ENOENT') {
                this.#logger.error('Redis not started up (subscriber).');
            } else {
                this.#logger.error('Redis error (subscriber):', error);
            }
        }
    }
    /**
     * Event emitted when Redis starts attempting to reconnect.
     */
    #redisReconnecting() {
        this.#logger.warn('Redis subscriber is reconnecting...');
    }
    /**
     * Inserts a new user into Redis for later checking.
     * @param {import('../../parser/msg.js')} message New user information
     */
    async message(message) {
        const {wiki, language, domain, user} = message;
        const key = `newusers:${user}:${wiki}:${language}:${domain}`;
        await this.#redis
            .multi()
            .setbit(key, 0, 1)
            .expire(key, CACHE_EXPIRY)
            .exec();
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
            try {
                const [userData] = await getUserData(this.#io, [user]);
                if (userData && isReportable(userData)) {
                    await this.#reportUser(
                        Number(userData.id),
                        userData,
                        wiki,
                        language,
                        domain
                    );
                }
                return;
            } catch (error) {
                errors.push(error);
            }
            await wait(retry * RETRY_DELAY);
        }
        this.#logger.error(`Errors while fetching user ID (${message}):`, ...errors);
    }
    /**
     * Tries to find a random Fandom user by guessing a random ID, fetching next
     * 50 users starting from that ID, then reporting it into the channel and
     * inserting it into the database if any reportable user has been found.
     *
     * Only meant to be used for testing purposes. Absolutely do not use this in
     * production!
     */
    async #insertTestUser() {
        try {
            const startUserId = Math.round(Math.random() * 50000000);
            const userIds = Array(50).fill().map((_, i) => startUserId + i);
            const {users} = await this.#io.userInfo(userIds);
            const foundUser = Object.entries(users)
                .find(([_, user]) => isReportable(user));
            if (!foundUser) {
                // No reportable users found.
                return;
            }
            const [userId, userData] = foundUser;
            await this.#reportUser(
                userId,
                userData,
                'kocka',
                'en',
                'fandom.com'
            );
        } catch (error) {
            if (error && error.response && error.response.statusCode === 404) {
                // No reportable users found.
                return;
            }
            if (error.code === 'ERR_NON_2XX_3XX_RESPONSE') {
                this.#logger.debug(
                    'Error while reporting test user:',
                    error.response
                );
            } else {
                this.#logger.debug('Error while reporting test user:', error);
            }
        }
    }
    /**
     * Reports a user for classification in the Discord channel, and inserts it
     * into the database with an unknown classification status.
     * @param {number} userId ID of the user to report
     * @param {object} userData User profile data
     * @param {string} wiki Wiki the user created their account on
     * @param {string} language Language path of the wiki
     * @param {string} domain Domain of the wiki
     */
    async #reportUser(userId, userData, wiki, language, domain) {
        await this.#insertProfileToDB(userId, userData);
        await this.#postToDiscord(userId, userData, wiki, language, domain);
    }
    /**
     * Inserts a user's profile information into the database.
     * @param {number} id User's ID
     * @param {object} info User information
     */
    async #insertProfileToDB(id, info) {
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
    async #postToDiscord(userId, info, wiki, language, domain) {
        const {avatar, username} = info;
        const message = await this.#webhook.send({
            components: [{
                components: [
                    {
                        // eslint-disable-next-line camelcase
                        custom_id: `spam:${userId}:${username}`,
                        emoji: {
                            id: null,
                            name: '🗑️'
                        },
                        label: 'Spam',
                        style: 4,
                        type: MessageComponentTypes.BUTTON
                    },
                    {
                        // eslint-disable-next-line camelcase
                        custom_id: `notspam:${userId}:${username}`,
                        emoji: {
                            id: null,
                            name: '✔'
                        },
                        label: 'Not spam',
                        style: 3,
                        type: MessageComponentTypes.BUTTON
                    }
                ],
                type: MessageComponentTypes.ACTION_ROW
            }],
            embeds: [{
                fields: Object.keys(PROPERTY_MAP)
                    .filter(key => info[key])
                    .map(key => ({
                        inline: true,
                        name: PROPERTY_MAP[key],
                        value: this
                            .#formatSocial(PREFIXES[key], info[key])
                            .slice(0, 1000)
                    })),
                image: avatar ? {
                    url: avatar
                } : undefined,
                title: username,
                url: `${url(wiki, language, domain)}/wiki/Special:Contribs/${encode(username)}`
            }]
        });
        this.#redis.sadd(REDIS_MESSAGES_KEY, message.id);
    }
    /**
     * Classifies a user as spam or not spam and removes the report for them
     * from the classification channel.
     * @param {boolean} isSpam Whether the user is spam or not
     * @param {number|string} user ID or username of the Fandom user being
     * classified
     * @param {string} classifierId Discord user ID of the classifying user
     * @param {string|null} messageId ID of the Discord message where the user
     * was reported
     */
    async classify(isSpam, user, classifierId, messageId = null) {
        try {
            await this.#updateClassification(isSpam, user, classifierId);
            if (messageId) {
                await this.#webhook.deleteMessage(messageId);
                await this.#redis.srem(REDIS_MESSAGES_KEY, messageId);
            }
        } catch (error) {
            this.#logger.error('Classification error', error);
        }
    }
    /**
     * Clears out the classification channel and marks all users in it as not
     * spam.
     * @param {string} reporterId Discord user who requested the cleanup
     */
    async clean(reporterId) {
        await this.#updateClassificationAll(false, reporterId);
        await this.#clean();
    }
    /**
     * Classifies a profile as spam or not spam.
     * @param {boolean} isSpam Whether the profile is spam
     * @param {number|string} user ID or username of the Fandom user being
     * classified
     * @param {string} classifierId Discord user ID of the classifying user
     * @returns {Promise<any>} Result of the insert operation
     */
    #updateClassification(isSpam, user, classifierId) {
        const query = typeof user === 'string' ?
            UPDATE_PROFILE_QUERY_NAME :
            UPDATE_PROFILE_QUERY_ID;
        return this.#db.execute(query, [
            isSpam,
            classifierId,
            new Date(),
            user
        ]);
    }
    /**
     * Classifies all unclassified profiles as spam or not spam.
     * @param {boolean} isSpam Whether the profile is spam
     * @param {string} classifierId Discord ID of the classifying user
     * @returns {Promise<any>} Result of the insert operation
     */
    #updateClassificationAll(isSpam, classifierId) {
        return this.#db.execute(UPDATE_ALL_PROFILES, [
            isSpam,
            classifierId,
            new Date()
        ]);
    }
    /**
     * Removes all report messages up until this point.
     */
    async #clean() {
        const numMembers = await this.#redis.scard(REDIS_MESSAGES_KEY);
        const messages = await this.#redis.spop(REDIS_MESSAGES_KEY, numMembers);
        for (const message of messages) {
            try {
                await this.#webhook.deleteMessage(message);
            } catch (error) {
                this.#logger.error('Error while cleaning up reports', error);
            }
        }
    }
    /**
     * Cleans up the resources after a kill has been requested.
     */
    async kill() {
        this.#killing = true;
        this.#webhook.destroy();
        if (this.#testUserInterval) {
            clearInterval(this.#testUserInterval);
        }
        await promisify(this.#subscriber.quit).call(this.#subscriber);
    }
}

module.exports = ReportsChannel;
