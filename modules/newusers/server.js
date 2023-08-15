/**
 * server.js
 *
 * Module for handling Discord interactions for profile classification.
 */
'use strict';

const express = require('express');
const {
    verifyKeyMiddleware,
    InteractionType,
    InteractionResponseType,
    MessageComponentTypes
} = require('discord-interactions');
const {WebhookClient, MessageFlags} = require('discord.js');

const UPDATE_PROFILE_QUERY_BASE = 'UPDATE `profiles` SET ' +
        '`is_spam` = ?, ' +
        '`classifying_user` = ?, ' +
        '`classification_date` = ?';
const UPDATE_PROFILE_QUERY_ID = `${UPDATE_PROFILE_QUERY_BASE}
    WHERE \`id\` = ?`;
const UPDATE_PROFILE_QUERY_NAME = `${UPDATE_PROFILE_QUERY_BASE}
    WHERE \`name\` = ?`;
const GET_USERNAME_QUERY = 'SELECT `name` FROM `profiles` WHERE `id` = ?';

/**
 * Handles Discord interaction requests for classifying profiles as spam or not
 * spam.
 */
class NewUsersServer {
    /**
     * HTTP server returned by Express.
     * @type {import('http').Server}
     */
    #server = null;
    /**
     * This module's database connection.
     * @type {import('mysql2/promise').Pool}
     */
    #db = null;
    /**
     * The webhook that relays profile report messages.
     * @type {WebhookClient}
     */
    #profilesWebhook = null;
    /**
     * Staging area controls.
     * @type {import('./staging.js')|null}
     */
    #staging = null;
    /**
     * Class constructor.
     * @param {number} port Express server's port
     * @param {string} publicKey Discord app's public key
     * @param {import('mysql2/promise').Pool} db Database connection
     * @param {object} transport Discord transport configuration
     * @param {import('./staging.js')} staging Staging area controls
     */
    constructor(port, publicKey, db, transport, staging) {
        this.#db = db;
        this.#staging = staging;
        const app = express();
        app.post(
            '/',
            verifyKeyMiddleware(publicKey),
            this.#handle.bind(this)
        );
        this.#server = app.listen(port);
        this.#profilesWebhook = new WebhookClient({
            id: transport.id,
            token: transport.token
        });
    }
    /**
     * Handles a Discord interaction request.
     * @param {express.Request} req Request data
     * @param {express.Response} res Response data
     */
    async #handle(req, res) {
        const {type, data, message, member} = req.body;
        const {
            custom_id: customId,
            component_type: componentType,
            name,
            options
        } = data;
        const [status, userId] = (customId || '').split('-');
        const isSpam = status === 'spam';
        const reporterId = member.user.id;
        const reporter = member.user.username;
        const [userOpt] = options || [];
        switch (type) {
            case InteractionType.PING:
                res.json({
                    type: InteractionResponseType.PONG
                });
                break;
            case InteractionType.MESSAGE_COMPONENT:
                if (componentType !== MessageComponentTypes.BUTTON) {
                    res.status(400).json({
                        message: 'Unexpected component type.'
                    });
                    break;
                }
                switch (status) {
                    case 'spam':
                    case 'notspam':
                        await this.#classify(
                            isSpam,
                            reporterId,
                            Number(userId)
                        );
                        await this.#profilesWebhook.deleteMessage(message.id);
                        if (status === 'spam') {
                            const username = await this.#getUsername(userId);
                            await this.#staging.addUser(username, reporter);
                        }
                        break;
                    case 'move':
                        await this.#staging.moveReports();
                        break;
                    default:
                        res.status(400).json({
                            message: 'Unexpected component.'
                        });
                        return;
                }
                res.json({
                    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
                });
                break;
            case InteractionType.APPLICATION_COMMAND:
                switch (name) {
                    case 'report':
                        await this.#staging.addUser(userOpt.value, reporter);
                        await this.#classify(true, reporterId, userOpt.value);
                        break;
                    case 'unreport':
                        await this.#staging.removeUser(userOpt.value);
                        await this.#classify(false, reporterId, userOpt.value);
                        break;
                    default:
                        res.status(400).json({
                            message: 'Unexpected slash command.'
                        });
                        return;
                }
                res.json({
                    data: {
                        content: 'Done!',
                        flags: MessageFlags.Ephemeral
                    },
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE
                });
                break;
            case InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE:
            case InteractionType.MODAL_SUBMIT:
            default:
                res.status(400).json({
                    message: 'Unexpected interaction type.'
                });
                break;
        }
    }
    /**
     * Classifies a profile as spam or not spam.
     * @param {boolean} isSpam Whether the profile is spam
     * @param {string} discordUserId ID of the classifying user
     * @param {number|string} fandomUser ID/username of the Fandom user being
     * classified
     * @returns {Promise} Result of the insert operation
     */
    #classify(isSpam, discordUserId, fandomUser) {
        const query = typeof fandomUser === 'string' ?
            UPDATE_PROFILE_QUERY_NAME :
            UPDATE_PROFILE_QUERY_ID;
        return this.#db.execute(query, [
            isSpam,
            discordUserId,
            new Date(),
            fandomUser
        ]);
    }
    /**
     * Gets a Fandom user's username from the database.
     * @param {number} userId Fandom user ID
     * @returns {Promise<string>} Fandom username
     */
    async #getUsername(userId) {
        const row = await this.#db.execute(GET_USERNAME_QUERY, [userId]);
        return row[0][0].name;
    }
    /**
     * Kills the interaction handler.
     */
    kill() {
        this.#server.close();
        this.#profilesWebhook.destroy();
    }
}

module.exports = NewUsersServer;
