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
      Message = require('./msg.js'),
      Logger = require('./log.js'),
      Cache = require('./cache.js');

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
     * @param {Object} config KockaLogger configuration
     * @param {Boolean} debug KockaLogger debug mode
     * @param {Loader} loader Loader instance
     */
    constructor(config, {debug}, loader) {
        this._config = config;
        this._debug = debug;
        this._loader = loader;
        this._initLogger(config.logging || {});
        Cache.setup(config.cache || {}, debug);
        this._initModules();
    }
    /**
     * Initializes the debug/info/error logger
     * @param {Object} config Logging configuration
     * @private
     */
    _initLogger(config) {
        Logger.setup(config, this._debug);
        this._logger = new Logger({
            file: true,
            name: 'client',
            stdout: true
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
                this._modules[mod] = new Module(
                    this._config.modules[mod],
                    this
                );
            } catch (e) {
                this._logger.error(
                    'Error while initializing module',
                    mod, ':', e
                );
            }
        }
    }
    /**
     * Initializes the IRC client
     * @param {Object} data Loader data
     */
    run(data) {
        Message.setup(data);
        this._logger.info('Setting up modules...');
        for (const mod in this._modules) {
            this._modules[mod].setup(data);
        }
        this._logger.info('Initializing IRC client...');
        const config = this._config.client;
        this._client = new irc.Client(config.server, config.nick, {
            channels: [
                config.channels.rc,
                config.channels.discussions,
                config.channels.newusers
            ],
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
        this._logger.info(command.args[1]);
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
                this._logger.info('Joined', type, 'channel');
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
        this._logger.error('IRC error', command);
    }
    /**
     * An IRC message has been sent
     * @private
     * @param {String} user User sending the message
     * @param {String} channel Channel the message was sent to
     * @param {String} message Message contents
     * @param {Object} debug IRC message object
     */
    _message(user, channel, message, debug) {
        if (!message) {
            this._logger.error('IRC message is null', debug);
            return;
        }
        for (const i in this._config.client.channels) {
            if (
                user.startsWith(this._config.client.users[i]) &&
                channel === this._config.client.channels[i]
            ) {
                const msg = this[`_${i}Message`](message);
                if (msg && msg.type) {
                    this._dispatchMessage(msg);
                } else if (msg && (i !== 'rc' || this._notFirstMessage)) {
                    this._logger.error(
                        'FAILED TO PARSE MESSAGE IN',
                        channel, ':', msg.raw
                    );
                } else if (this._notFirstMessage) {
                    this._logger.error(
                        'PARSED MESSAGE IS NULL',
                        channel, ':', this._toParse, '(', msg,
                        'overflow:', this._overflow, ')'
                    );
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
     * @private
     * @param {String} message Message to handle
     * @returns {Message} Parsed message object
     * @todo Edge cases:
     *  - Overflows can start with \x0314
     *  - Overflows may not come right after the message!
     */
    _rcMessage(message) {
        let msg = null;
        if (message.startsWith('\x0314')) {
            if (this._overflow) {
                this._toParse = this._overflow;
                msg = new Message(this._overflow, 'rc');
            }
            this._overflow = message;
        } else {
            this._toParse = `${this._overflow}${message}`;
            msg = new Message(this._toParse, 'rc');
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
                this._logger.error(
                    'Dispatch error to module',
                    mod, ':', e
                );
            }
        }
    }
    /**
     * Updates custom messages
     * @param {String} wiki Wiki to update the messages on
     * @param {String} language Language of the wiki
     * @param {Object} messages Map of customized messages
     */
    updateMessages(wiki, language, messages) {
        this._logger.info('Updating messages for', wiki);
        this._logger.debug(messages);
        this._loader.updateCustom(
            wiki,
            language,
            messages,
            Message.update.bind(Message)
        );
    }
    /**
     * Gets whether the debug mode is enabled
     * @returns {Boolean} Whether the debug mode is enabled
     */
    get debug() {
        return this._debug;
    }
}

module.exports = Client;
