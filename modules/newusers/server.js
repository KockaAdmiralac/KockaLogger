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
const {MessageFlags} = require('discord.js');

/**
 * Handles Discord interaction requests for classifying profiles as spam or not
 * spam.
 */
class NewUsersServer {
    /**
     * This module's logger.
     * @type {import('../../include/log.js')}
     */
    #logger = null;
    /**
     * HTTP server returned by Express.
     * @type {import('http').Server}
     */
    #server = null;
    /**
     * Staging area controls.
     * @type {import('./staging.js')|null}
     */
    #staging = null;
    /**
     * Reports area controls.
     * @type {import('./reports.js')|null}
     */
    #reports = null;
    /**
     * Class constructor.
     * @param {import('../../include/log.js')} log This module's logger
     * @param {import('./staging.js')} staging Staging area controls
     * @param {import('./reports.js')} reports Reports area controls
     * @param {object} config Server configuration
     * @param {number} config.port Express server's port
     * @param {string} config.publicKey Discord app's public key
     */
    constructor(log, staging, reports, config) {
        const {port, publicKey} = config;
        this.#logger = log;
        this.#staging = staging;
        this.#reports = reports;
        const app = express();
        app.post(
            '/',
            verifyKeyMiddleware(publicKey),
            this.#handleWrapper.bind(this)
        );
        this.#server = app.listen(port);
    }
    /**
     * Calls #handle but with error handling around it.
     * @param {express.Request} req Request data
     * @param {express.Response} res Response data
     */
    async #handleWrapper(req, res) {
        try {
            await this.#handle(req, res);
        } catch (error) {
            this.#logger.error(
                'Unexpected error in the Discord command handler',
                error
            );
        }
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
        switch (type) {
            case InteractionType.PING:
                // Discord has requested a ping from our command handler.
                res.json({
                    type: InteractionResponseType.PONG
                });
                break;
            case InteractionType.MESSAGE_COMPONENT:
                // A button was pressed on one of our messages.
                if (componentType !== MessageComponentTypes.BUTTON) {
                    this.#reportError(res, 'Unexpected component type.');
                    break;
                }
                if (customId === 'move') {
                    await this.#staging.moveReports();
                } else {
                    await this.#handleClassification(
                        customId,
                        member,
                        message.id
                    );
                }
                res.json({
                    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE
                });
                break;
            case InteractionType.APPLICATION_COMMAND:
                // A slash command was used.
                switch (name) {
                    case 'report':
                    case 'unreport':
                        await this.#handleReport(name, options, member);
                        break;
                    case 'clean':
                        res.json({
                            data: {
                                content: 'Clean in progress!',
                                flags: MessageFlags.Ephemeral
                            },
                            type: InteractionResponseType
                                .CHANNEL_MESSAGE_WITH_SOURCE
                        });
                        await this.#reports.clean(member.user.id);
                        return;
                    default:
                        this.#reportError(res, 'Unexpected slash command.');
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
                this.#reportError(res, 'Unexpected interaction type.');
                break;
        }
    }
    /**
     * Reports an error from the command handler and logs it.
     * @param {express.Response} res Response data
     * @param {string} message Error message
     */
    #reportError(res, message) {
        this.#logger.error(`Command handler error: ${message}`);
        res.status(400).json({message});
    }
    /**
     * Handles classification buttons (spam/not spam) on report messages.
     * @param {string} customId Button's custom ID, consisting of "spam"/
     * "notspam", the user's ID, and the user's username, separated by colons
     * @param {import('discord.js').GuildMember} member Member who used the
     * button
     * @param {string} messageId Discord message ID where the button was used
     */
    async #handleClassification(customId, member, messageId) {
        const [status, userIdStr, username] = customId.split(':');
        const isSpam = status === 'spam';
        const userId = Number(userIdStr);
        const reporterId = member.user.id;
        const reporter = member.user.username;
        await this.#reports.classify(isSpam, userId, reporterId, messageId);
        if (isSpam) {
            await this.#staging.addUser(username, reporter);
        }
    }
    /**
     * Handles /report and /unreport slash commands.
     * @param {string} command Command name
     * @param {object[]} options Command options
     * @param {import('discord.js').GuildMember} member Member who used the
     * command
     */
    async #handleReport(command, options, member) {
        const username = options[0].value;
        const isSpam = command === 'report';
        const reporterId = member.user.id;
        const reporter = member.user.username;
        await this.#reports.classify(isSpam, username, reporterId);
        if (isSpam) {
            await this.#staging.addUser(username, reporter);
        } else {
            await this.#staging.removeUser(username);
        }
    }
    /**
     * Kills the interaction handler.
     */
    kill() {
        this.#server.close();
    }
}

module.exports = NewUsersServer;
