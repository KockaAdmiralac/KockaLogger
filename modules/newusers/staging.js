/**
 * staging.js
 *
 * Handles logic for moving to and from the staging Discord channel.
 */
'use strict';

const {MessageComponentTypes} = require('discord-interactions');
const {WebhookClient} = require('discord.js');
const {mwn: Mwn} = require('mwn');
const {getUserData, isReportable} = require('./util.js');
const {encode} = require('../../include/util.js');

const REDIS_LIST_KEY = 'newusers-staging';
const MOVE_INTERVAL = 20 * 60 * 1000;

/**
 * Represents a staging area: a Discord channel which the reports arrive to
 * before being moved to the Report:Spam page on the SOAP Wiki.
 */
class StagingArea {
    /**
     * API client.
     * @type {import('../../include/io.js')}
     */
    #io = null;
    /**
     * Redis client instance.
     * @type {import('ioredis').Redis}
     */
    #redis = null;
    /**
     * This module's logger.
     * @type {import('../../include/log.js')}
     */
    #logger = null;
    /**
     * Webhook client of the webhook holding the update message.
     * @type {WebhookClient}
     */
    #webhook = null;
    /**
     * ID of the Discord message where current reports are being shown to
     * reporters.
     * @type {string}
     */
    #messageId = '';
    /**
     * Name of the wiki page where reports are stored.
     */
    #page = '';
    /**
     * ID of the auto-move interval.
     * @type {number}
     */
    #interval = setInterval(this.#autoMove.bind(this), MOVE_INTERVAL);
    /**
     * Timestamp of the next auto-move.
     * @type {number}
     */
    #nextMove = Date.now() + MOVE_INTERVAL;
    /**
     * Bot for editing wiki pages on the target wiki.
     * @type {Mwn}
     */
    #bot = null;
    /**
     * Class constructor to initialize all dependent resources.
     * @param {import('../../include/io.js')} io API client
     * @param {import('ioredis').Redis} redis Redis client
     * @param {import('../../include/log.js')} log This module's logger
     * @param {object} config Staging area configuration
     * @param {string} config.id Report webhook ID
     * @param {string} config.token Report webhook token
     * @param {string} config.messageId Message ID of the reports message
     * @param {string} config.username Report bot username
     * @param {string} config.password Report bot password
     * @param {string} config.wiki Wiki to report on
     * @param {string} config.page Page to report on
     */
    constructor(io, redis, log, config) {
        const {messageId, id, token, username, password, wiki, page} = config;
        this.#io = io;
        this.#redis = redis;
        this.#logger = log;
        this.#webhook = new WebhookClient({
            id,
            token
        });
        this.#messageId = messageId;
        this.#page = page;
        this.#bot = new Mwn({
            apiUrl: `https://${wiki}.fandom.com/api.php`,
            defaultParams: {
                assert: 'user'
            },
            password,
            userAgent: 'KockaLogger profile reports',
            username
        });
    }
    /**
     * Logs in to Fandom and updates the staging message. This is meant to be
     * run when the module is being set up.
     */
    async setup() {
        await this.#bot.login();
        await this.#updateStagingMessage();
    }
    /**
     * Adds a reported user to the staging area.
     * @param {string} user Fandom account username of the user to add
     * @param {string} reporter Discord username of the reporting user
     */
    async addUser(user, reporter) {
        try {
            await this.#redis.hset(REDIS_LIST_KEY, user, reporter);
            await this.#updateStagingMessage();
        } catch (error) {
            this.#logger.error('Error while staging a user', error);
        }
    }
    /**
     * Removes a reported user from the staging area.
     * @param {string} user Fandom account username of the user to remove
     */
    async removeUser(user) {
        try {
            await this.#redis.hdel(REDIS_LIST_KEY, user);
            await this.#updateStagingMessage();
        } catch (error) {
            this.#logger.error('Error while unstaging a user', error);
        }
    }
    /**
     * Called every time the bot should be automatically moving reports to the
     * wiki.
     *
     * The manual reports are done by calling moveReports directly.
     */
    async #autoMove() {
        this.#nextMove = Date.now() + MOVE_INTERVAL;
        await this.moveReports();
    }
    /**
     * Lists all reporters who participated in a report in a grammatically
     * correct English sentence.
     *
     * For example, one reporter would be "User1", two would be "User1 and
     * User2", three would be "User1, User2 and User3", etc.
     * @param {string[]} reporters Reporters included in a report
     * @returns {string} Grammatically correct list of reporters
     */
    #reporterList(reporters) {
        if (reporters.length === 1) {
            return reporters[0];
        }
        return `${reporters.slice(0, -1).join(', ')} and ${reporters[0]}`;
    }
    /**
     * Moves reports from the staging area to the wiki.
     */
    async moveReports() {
        try {
            const reports = await this.#redis.hgetall(REDIS_LIST_KEY);
            const users = Object.keys(reports);
            if (users.length === 0) {
                // Nothing to report.
                return;
            }
            // TODO: Log users before moving.
            const userData = await getUserData(this.#io, users);
            const filteredUsers = userData
                .filter(isReportable)
                .map(u => u.username);
            if (filteredUsers.length === 0) {
                return;
            }
            const reporters = Array.from(new Set(Object.values(reports)));
            const reporterList = this.#reporterList(reporters);
            const summary = `Profile reports by ${reporterList} from Discord`;
            await this.#bot.save(
                this.#page,
                undefined,
                summary,
                {
                    appendtext: `\n\n== ${filteredUsers.length} user(s) ==\n{{Report profile|c|${summary}|${filteredUsers.join('|')}|{{subst:REVISIONUSER}}|~~~~~}}`,
                    bot: true
                }
            );
            await this.#redis.hdel(REDIS_LIST_KEY, users);
            await this.#updateStagingMessage();
        } catch (error) {
            this.#logger.error('Error while moving reports', error);
        }
    }
    /**
     * Forms a list of link to contributions of Fandom users in a Discord
     * message not exceeding 1900 characters.
     * @param {string[]} users Fandom users whose contributions should be linked
     * @returns {string} Formatted user list
     */
    #getUsersMessage(users) {
        const usersDiscord = users.map(
            u => `- [${u}](<https://c.fandom.com/Special:Contribs/${encode(u)}>)`
        );
        const pickedUsers = [];
        let messageLength = 0;
        for (const user of usersDiscord) {
            if (messageLength + user.length + 1 > 1900) {
                pickedUsers.push('- …');
                break;
            }
            messageLength += user.length + 1;
            pickedUsers.push(user);
        }
        return pickedUsers.join('\n');
    }
    /**
     * Updates a message in the staging Discord channel.
     */
    async #updateStagingMessage() {
        const users = await this.#redis.hkeys(REDIS_LIST_KEY);
        const usersMessage = this.#getUsersMessage(users);
        const nextMoveMessage = `Next auto-move at: <t:${Math.round(this.#nextMove / 1000)}:R>`;
        const messageContent = users.length === 0 ?
            'Currently no reports!' :
            `Currently **${users.length}** reports:\n${usersMessage}\n${nextMoveMessage}`;
        await this.#webhook.editMessage(this.#messageId, {
            components: [{
                components: [
                    {
                        // eslint-disable-next-line camelcase
                        custom_id: 'move',
                        label: 'Move reports',
                        style: 3,
                        type: MessageComponentTypes.BUTTON
                    }
                ],
                type: MessageComponentTypes.ACTION_ROW
            }],
            content: messageContent
        });
    }
    /**
     * Deinitializes the staging area.
     */
    kill() {
        clearInterval(this.#interval);
        this.#webhook.destroy();
    }
}

module.exports = StagingArea;
