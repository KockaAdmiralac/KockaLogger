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
const {WebhookClient} = require('discord.js');

const UPDATE_PROFILE_QUERY = 'UPDATE `profiles` SET ' +
        '`is_spam` = ?, ' +
        '`classifying_user` = ?, ' +
        '`classification_date` = ? ' +
    'WHERE `id` = ?';

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
     * Class constructor.
     * @param {number} port Express server's port
     * @param {string} publicKey Discord app's public key
     * @param {import('mysql2/promise').Pool} db Database connection
     * @param {object} transport Discord transport configuration
     */
    constructor(port, publicKey, db, transport) {
        this.#db = db;
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
            component_type: componentType
        } = data;
        const [status, userId] = (customId || '').split('-');
        const isSpam = status === 'spam';
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
                await this.#classify(isSpam, member.user.id, Number(userId));
                await this.#profilesWebhook.deleteMessage(message.id);
                break;
            case InteractionType.APPLICATION_COMMAND:
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
     * @param {number} fandomUserId ID of the Fandom user being classified
     * @returns {Promise} Result of the insert operation
     */
    #classify(isSpam, discordUserId, fandomUserId) {
        return this.#db.execute(UPDATE_PROFILE_QUERY, [
            isSpam,
            discordUserId,
            new Date(),
            fandomUserId
        ]);
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
