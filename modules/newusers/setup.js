/**
 * setup.js
 *
 * Sets up all Discord resources required by this module.
 * Meant to be run separately from KockaLogger itself. You only run this once.
 */
'use strict';

const {
    appId,
    appSecret,
    redirectUrl,
    token
    /* eslint-disable node/no-unpublished-require */
    /* eslint-disable node/no-missing-require */
} = require('../../config.json').modules.newusers;
/* eslint-enable node/no-unpublished-require */
/* eslint-enable node/no-missing-require */
const {createInterface} = require('readline');
const {stdin, stdout} = require('process');
const {URL} = require('url');
const got = require('got').default;
const {WebhookClient} = require('discord.js');

const rl = createInterface({
    input: stdin,
    output: stdout
});

/**
 * Reads user's input from standard input.
 * @param {string} query Query to ask the user
 * @returns {Promise<string>} String that was read
 */
function question(query) {
    return new Promise(function(resolve) {
        rl.question(query, resolve);
    });
}

/**
 * Sets up /report and /unreport slash commands for the bot.
 */
async function setupCommands() {
    const headers = {
        Authorization: `Bot ${token}`
    };
    await got.post(`https://discord.com/api/applications/${appId}/commands`, {
        headers,
        json: {
            description: 'Report a given Fandom user\'s profile as spam.',
            name: 'report',
            options: [
                {
                    description: 'Fandom username',
                    name: 'user',
                    required: true,
                    type: 3
                }
            ],
            type: 1
        }
    }).json();
    await got.post(`https://discord.com/api/applications/${appId}/commands`, {
        headers,
        json: {
            description: 'Unreport a given Fandom user\'s profile as spam.',
            name: 'unreport',
            options: [
                {
                    description: 'Fandom username',
                    name: 'user',
                    required: true,
                    type: 3
                }
            ],
            type: 1
        }
    }).json();
}

/**
 * Sets up an application-owned webhook.
 * @returns {object} Webhook information
 */
async function setupWebhook() {
    const url = new URL('https://discord.com/api/oauth2/authorize');
    url.searchParams.append('client_id', appId);
    url.searchParams.append('scope', 'webhook.incoming');
    url.searchParams.append('redurect_uri', redirectUrl);
    url.searchParams.append('response_type', 'code');
    console.info('Visit this URL:', url.toString());
    const authUrl = await question('Enter the URL you got redirected to: ');
    const code = new URL(authUrl).searchParams.get('code');
    const response = await got.post('https://discord.com/api/oauth2/token', {
        form: {
            // eslint-disable-next-line camelcase
            client_id: appId,
            // eslint-disable-next-line camelcase
            client_secret: appSecret,
            code,
            // eslint-disable-next-line camelcase
            grant_type: 'authorization_code',
            // eslint-disable-next-line camelcase
            redirect_uri: redirectUrl
        }
    }).json();
    console.info('Your webhook information:', response.webhook);
    rl.close();
    return response.webhook;
}

/**
 * Posts a message with the newly-created application-owned webhook.
 * @param {object} webhookInfo Webhook information
 */
async function setupMessage(webhookInfo) {
    const webhook = new WebhookClient(webhookInfo);
    const message = await webhook.send('Initial message.');
    console.info('Your message:', message.id);
    webhook.destroy();
}

/**
 * Asynchronous entry point.
 */
async function main() {
    await setupCommands();
    const webhookInfo = await setupWebhook();
    await setupMessage(webhookInfo);
}

main();
