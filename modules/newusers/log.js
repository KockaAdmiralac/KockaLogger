/**
 * log.js
 *
 * Handles all logic related to the new users channel and database table.
 */
'use strict';

const {WebhookClient} = require('discord.js');
const {url, shorturl, encode} = require('../../include/util.js');

const INSERT_USER_QUERY = 'INSERT INTO `newusers` (`name`, `wiki`, ' +
    '`language`, `domain`) VALUES(?, ?, ?, ?)';

/**
 * Log channel: deals with posting about every new user who created their
 * account and writing their data to the database.
 */
class LogChannel {
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
     * Webhook for logging user creations.
     * @type {WebhookClient}
     */
    #webhook = null;
    /**
     * Class constructor.
     * @param {import('mysql2/promise').Pool} db This module's database
     * connection
     * @param {import('../../include/log.js')} log This module's logger
     * @param {import('discord.js').WebhookClientData} config Configuration for
     * the webhook that logs user creations
     */
    constructor(db, log, config) {
        this.#db = db;
        this.#logger = log;
        this.#webhook = new WebhookClient(config);
    }
    /**
     * On every new user creation, logs it to a Discord channel and a database
     * table.
     * @param {import('../../parser/msg.js')} message New user information
     */
    async message(message) {
        try {
            await this.#logToDiscord(message);
            await this.#logToDB(message);
        } catch (error) {
            this.#logger.error('Error while logging a new user', error);
        }
    }
    /**
     * Logs all creations in a separate channel for logging new users.
     * @param {import('../../parser/msg.js')} message New user information
     */
    async #logToDiscord(message) {
        const {wiki, language, domain, user} = message;
        const wikiUrl = url(wiki, language, domain);
        await this.#webhook.send({
            content: `[${user}](<${wikiUrl}/wiki/Special:Contribs/${encode(user)}>) ([talk](<${wikiUrl}/wiki/User_talk:${encode(user)}>) | [${
                shorturl(wiki, language, domain)
            }](<${wikiUrl}/wiki/Special:Log/newusers>))`
        });
    }
    /**
     * Inserts a new user into the database, along with the wiki their account
     * was created on.
     * @param {import('../../parser/msg.js')} message New user information
     */
    async #logToDB(message) {
        const {user, wiki, language, domain} = message;
        await this.#db.execute(INSERT_USER_QUERY, [
            user,
            wiki,
            language,
            domain
        ]);
    }
    /**
     * Cleans up the resources after a kill has been requested.
     */
    kill() {
        this.#webhook.destroy();
    }
}

module.exports = LogChannel;
