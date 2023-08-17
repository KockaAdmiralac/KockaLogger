/**
 * main.js
 *
 * Main module for the new user creation log and spam profile finder.
 */
'use strict';

const Client = require('../../include/client.js');
const Message = require('../../parser/msg.js');
const Module = require('../module.js');
const Logger = require('../../include/log.js');
const mysql = require('mysql2/promise');
const StagingArea = require('./staging.js');
const LogChannel = require('./log.js');
const ReportsChannel = require('./reports.js');

/**
 * Module for recording account creations and reporting possible profile spam.
 * @augments Module
 */
class NewUsers extends Module {
    /**
     * This module's logger.
     * @type {Logger}
     */
    #logger = null;
    /**
     * This module's database connection.
     * @type {mysql.Pool}
     */
    #db = null;
    /**
     * Whether the module is currently being killed.
     * @type {boolean}
     */
    #killing = false;
    /**
     * New user log channel controls.
     * @type {LogChannel|null}
     */
    #newusers = null;
    /**
     * Reports area controls.
     * @type {ReportsChannel|null}
     */
    #reports = null;
    /**
     * Staging area controls.
     * @type {StagingArea|null}
     */
   #staging = null;
   /**
    * Discord interactions handler.
    * @type {import('./server.js')|null}
    */
   #server = null;
    /**
     * Class constructor.
     * @param {object} config Module configuration
     * @param {Client} client Client instance
     */
    constructor(config, client) {
        super(config, client);
        const {db, discord, profiles, transport, log, staging, server} = config;
        this.#logger = this.#initLogger(discord);
        this.#db = this.#initDB(db);
        const reports = profiles || transport;
        if (log) {
            this.#newusers = new LogChannel(this.#db, this.#logger, log);
        }
        if (reports) {
            this.#reports = new ReportsChannel(
                this._io,
                this._cache,
                this.#db,
                this.#logger,
                reports
            );
        }
        if (staging) {
            this.#staging = new StagingArea(
                this._io,
                this._cache,
                this.#logger,
                staging
            );
        }
        if (server && this.#staging && this.#reports) {
            const NewUsersServer = require('./server.js');
            this.#server = new NewUsersServer(
                this.#logger,
                this.#staging,
                this.#reports,
                server
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
     * @param {object|undefined} discord Configuration for logging to Discord
     * @returns {Logger} Logger
     */
    #initLogger(discord) {
        return new Logger({
            discord,
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
     * Determines whether the module is interested to receive the message
     * and which set of properties does it expect to receive.
     * @param {Message} message Message to check
     * @returns {boolean} Whether the module is interested in receiving
     */
    interested(message) {
        return message.type === 'log' && message.log === 'newusers';
    }
    /**
     * Handles new user messages.
     *
     * Errors thrown from this method will be handled by the client. Ideally,
     * the components being called should handle their own errors.
     * @param {Message} message Message to handle
     */
    async execute(message) {
        if (this.#killing) {
            return;
        }
        if (this.#newusers) {
            await this.#newusers.message(message);
        }
        if (this.#reports) {
            await this.#reports.message(message);
        }
    }
    /**
     * Cleans up the resources after a kill has been requested.
     */
    async kill() {
        this.#killing = true;
        this.#logger.close();
        if (this.#newusers) {
            this.#newusers.kill();
        }
        if (this.#reports) {
            this.#reports.kill();
        }
        if (this.#staging) {
            this.#staging.kill();
        }
        if (this.#server) {
            this.#server.kill();
        }
        await this.#db.end();
    }
}

module.exports = NewUsers;
