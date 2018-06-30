/**
 * main.js
 *
 * Entry point of KockaLogger
 */
'use strict';

/**
 * Importing modules
 */
const irc = require('irc'),
      fs = require('fs'),
      Message = require('./msg.js');

/**
 * Constants
 */
const EVENTS = [
    'registered',
    'join',
    'error',
    'message'
];

/**
 * IRC client class
 */
class Client {
    /**
     * Class constructor
     */
    constructor() {
        this._initConfig();
        this._initLogger();
        this._initModules();
        Message.prepare();
    }
    /**
     * Initializes configuration
     * @private
     */
    _initConfig() {
        try {
            this._config = require('../config.json');
        } catch (e) {
            console.log('Configuration failed to load!', e, 'Exiting...');
            process.exit();
        }
    }
    /**
     * Initializes the file log stream
     * @private
     */
    _initLogger() {
        this._stream = fs.createWriteStream('log.txt', {
            flags: 'a'
        });
    }
    /**
     * Initializes KockaLogger modules
     * @private
     */
    _initModules() {
        this._modules = {};
        if (typeof this._config.modules !== 'object') {
            return;
        }
        for (const mod in this._config.modules) {
            try {
                const Module = require(`../modules/${mod}/main.js`);
                this._modules[mod] = new Module(this._config.modules[mod]);
            } catch (e) {
                console.log(e);
            }
        }
    }
    /**
     * Initializes the IRC client
     */
    run() {
        const config = this._config.client;
        this._client = new irc.Client(config.server, config.nick, {
            channels: [
                config.channels.rc,
                config.channels.discussions,
                config.channels.newusers
            ],
            // debug: true,
            port: config.port,
            realName: config.realname,
            retryCount: config.retries || 10,
            userName: config.username || config.nick
        });
        EVENTS.forEach(function(e) {
            this._client.on(e, this[`_${e}`].bind(this));
        }, this);
    }
    /**
     * The client has joined the IRC server
     * @private
     * @param {Object} command IRC command sent upon joining
     */
    _registered(command) {
        console.log(command.args[1]);
    }
    /**
     * The client has joined an IRC channel
     * @private
     * @param {String} channel Channel that was joined
     * @param {String} user User that joined the channel
     */
    _join(channel, user) {
        for (const type in this._config.client.channels) {
            if (
                channel === this._config.client.channels[type] &&
                user === this._config.client.nick
            ) {
                console.log(`Joined ${type} channel`);
                break;
            }
        }
    }
    /**
     * An IRC error occurred
     * @private
     * @param {Object} command IRC command sent upon error
     */
    _error(command) {
        console.log('IRC error', command);
    }
    /**
     * An IRC message has been sent
     * @private
     * @param {String} user User sending the message
     * @param {String} channel Channel the message was sent to
     * @param {String} message Message contents
     */
    _message(user, channel, message) {
        for (const i in this._config.client.channels) {
            if (
                user.startsWith(this._config.client.users[i]) &&
                channel === this._config.client.channels[i]
            ) {
                const msg = this[`_${i}Message`](message);
                if (msg && msg.type) {
                    this._dispatchMessage(msg);
                } else if (i !== 'rc' || this._notFirstMessage) {
                    this._stream.write(`${channel}: ${message}\n`);
                }
                if (i === 'rc') {
                    this._notFirstMessage = true;
                }
                break;
            }
        }
    }
    /**
     * Handles messages in the RC channel
     * @param {String} message Message to handle
     * @returns {Message} Parsed message object
     * @private
     * @todo Edge cases:
     *  - this._overflow is a shared resource
     *  - Overflows can start with \u000314
     *  - Overflows may not come right after the message!
     */
    _rcMessage(message) {
        let msg = null;
        if (message.startsWith('\u000314')) {
            if (this._overflow) {
                msg = new Message(this._overflow, 'rc');
            }
            this._overflow = message;
        } else {
            msg = new Message(`${this._overflow}${message}`, 'rc');
            this._overflow = '';
        }
        return msg;
    }
    /**
     * Handles messages in the Discussions channel
     * @param {String} message Message to handle
     * @returns {Message} Parsed message object
     * @private
     */
    _discussionsMessage(message) {
        const start = message.startsWith('{'),
              end = message.endsWith('}');
        if (start && end) {
            return new Message(message, 'discussions');
        } else if (start) {
            this._dOverflow = message;
        } else if (end && this._dOverflow) {
            const overflow = this._dOverflow;
            this._dOverflow = '';
            return new Message(`${overflow}${end}`, 'discussions');
        }
    }
    /**
     * Handles messages in the new users channel
     * @param {String} message Message to handle
     * @returns {Message} Parsed message object
     * @private
     */
    _newusersMessage(message) {
        if (message.endsWith('newusers')) {
            return new Message(message, 'newusers');
        }
    }
    /**
     * Dispatches the message to modules
     * @param {Message} message Message to dispatch
     * @private
     */
    _dispatchMessage(message) {
        for (const mod in this._modules) {
            try {
                this._modules[mod].execute(message);
            } catch (e) {
                console.log(e);
            }
        }
    }
}

module.exports = Client;
