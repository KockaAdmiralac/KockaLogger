/**
 * main.js
 *
 * Main controller of KockaLogger components.
 */
'use strict';

/**
 * Importing modules
 */
const irc = require('irc-upd'),
      redis = require('redis'),
      IO = require('./io.js'),
      Logger = require('./log.js'),
      Parser = require('../parser/parser.js');

/**
 * Constants.
 */
const EVENTS = [
    'registered',
    'join',
    'error',
    'message'
];

/**
 * IRC client class.
 */
class Client {
    /**
     * Class constructor.
     * @param {Object} config KockaLogger configuration
     * @param {Boolean} debug KockaLogger debug mode
     * @param {Loader} loader Loader instance
     */
    constructor(config, {debug}, loader) {
        this._config = config;
        this._debug = debug;
        this._loader = loader;
        this._io = new IO();
        this._fetching = {};
        this._initLogger(config.logging || {}, config.client.discord);
        this._initCache();
        this._initModules();
    }
    /**
     * Initializes the debug/info/error logger.
     * @param {Object} config Logging configuration
     * @param {Object} discord Discord logging configuration
     * @private
     */
    _initLogger(config, discord) {
        Logger.setup(config, this._debug, this._io);
        this._logger = new Logger({
            discord,
            file: true,
            name: 'client',
            stdout: true
        });
    }
    /**
     * Initializes a Redis client used for caching.
     * @private
     */
    _initCache() {
        this._cache = redis.createClient({
            path: '/tmp/redis_kockalogger.sock'
        })
        .on('connect', this._redisConnected.bind(this))
        .on('end', this._redisDisconnected.bind(this))
        .on('error', this._redisError.bind(this))
        .on('reconnecting', this._redisReconnecting.bind(this));
    }
    /**
     * Event emitted when the Redis client connects.
     * @private
     */
    _redisConnected() {
        this._logger.info('Connected to Redis.');
    }
    /**
     * Event emitted when the Redis client connects.
     * @private
     */
    _redisDisconnected() {
        this._logger.error('Disconnected from Redis.');
    }
    /**
     * Event emitted when an error occurs with Redis.
     * @param {Error} error Error that occurred
     * @private
     */
    _redisError(error) {
        if (error) {
            if (error.code === 'ENOENT') {
                this._logger.error('Redis not started up, exiting...');
                process.exit();
            } else {
                this._logger.error('Redis error:', error);
            }
        }
    }
    /**
     * Event emitted when Redis starts attempting to reconnect.
     * @private
     */
    _redisReconnecting() {
        this._logger.warn('Redis is reconnecting...');
    }
    /**
     * Initializes KockaLogger modules.
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
     * Initializes the IRC client.
     * @param {Object} data Loader data
     */
    run(data) {
        this._caches = data;
        this._parser = new Parser(this, data);
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
     * The client has joined the IRC server.
     * @private
     * @param {Object} command IRC command sent upon joining
     */
    _registered(command) {
        this._logger.info(command.args[1]);
    }
    /**
     * The client has joined an IRC channel.
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
     * An IRC error occurred.
     * @private
     * @param {Object} command IRC command sent upon error
     */
    _error(command) {
        this._logger.error('IRC error', command);
    }
    /**
     * An IRC message has been sent.
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
                if (msg && typeof msg === 'object') {
                    if (msg.error) {
                        this._dispatchError(msg);
                    } else {
                        this._dispatchMessage(msg);
                    }
                }
                break;
            }
        }
    }
    /**
     * Handles messages in the RC channel.
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
                msg = this._parser.parse(this._overflow, 'rc');
            }
            this._overflow = message;
        } else {
            const concat = `${this._overflow}${message}`;
            if (concat.startsWith('\x0314')) {
                msg = this._parser.parse(concat, 'rc');
                if (
                    msg.type === 'error' && msg.error === 'rcerror' ||
                    msg.type === 'log' && msg.error === 'logparsefail'
                ) {
                    msg = this._parser.parse(`${this._overflow} ${message}`, 'rc');
                }
            }
            this._overflow = '';
        }
        return msg;
    }
    /**
     * Handles messages in the Discussions channel.
     * @param {String} message Message to handle
     * @returns {Message} Parsed message object
     * @private
     */
    _discussionsMessage(message) {
        const start = message.startsWith('{'),
              end = message.endsWith('}');
        if (start && end) {
            return this._parser.parse(message, 'discussions');
        } else if (start) {
            this._dOverflow = message;
        } else if (end && this._dOverflow) {
            const overflow = this._dOverflow;
            this._dOverflow = '';
            return this._parser.parse(`${overflow}${end}`, 'discussions');
        }
    }
    /**
     * Handles messages in the new users channel.
     * @param {String} message Message to handle
     * @returns {Message} Parsed message object
     * @private
     */
    _newusersMessage(message) {
        if (message.endsWith('newusers')) {
            return this._parser.parse(message, 'newusers');
        }
        this._logger.error('Newusers message overflowed?', message);
    }
    /**
     * Dispatches the message to modules.
     * @param {Message} message Message to dispatch
     * @private
     */
    _dispatchMessage(message) {
        const interested = [];
        let properties = [];
        for (const mod in this._modules) {
            try {
                const m = this._modules[mod],
                      interest = m.interested(message);
                if (interest === true) {
                    m.execute(message);
                } else if (typeof interest === 'string') {
                    properties.push(interest);
                    interested.push(mod);
                } else if (interest instanceof Array) {
                    properties = properties.concat(interest);
                    interested.push(mod);
                }
            } catch (e) {
                this._logger.error(
                    'Dispatch error to module',
                    mod, ':', e
                );
            }
        }
        if (properties.length > 0) {
            message.fetch(this, properties).then(function() {
                interested.forEach(function(mod) {
                    try {
                        this._modules[mod].execute(message);
                    } catch (e) {
                        this._logger.error(
                            'Dispatch error to module',
                            mod, ':', e
                        );
                    }
                }, this);
            }.bind(this)).catch(() => this._logger.error(
                'Failed to fetch message information:',
                message.toJSON()
            ));
        }
    }
    /**
     * Dispatches a message that failed to parse.
     * @param {Message} message Message that failed to parse
     * @private
     */
    _dispatchError(message) {
        if (message.type === 'error') {
            this._logger.error(
                'Message failed to parse (early stages)',
                message.toJSON()
            );
            return;
        }
        const key = `${message.language}:${message.wiki}:${message.domain}`;
        // NOTE: This only works while logged out due to amlang.
        if (!this._fetching[key]) {
            this._fetching[key] = message;
            this._io.query(message.wiki, message.language, message.domain, {
                amcustomized: 'modified',
                ammessages: Object.keys(this._caches.i18n).join('|'),
                amprop: 'default',
                meta: 'allmessages'
            }).then(
                this._messageFetchCallback(
                    message.wiki,
                    message.language,
                    message.domain
                )
            ).catch(
                e => this._logger.error('Error while fetching messages', e)
            );
        }
    }
    /**
     * Creates a callback function for handling message fetching responses
     * @param {String} wiki Wiki to handle the responses from
     * @param {String} language Language of the wiki
     * @param {String} domain Domain of the wiki
     * @returns {Function} Generated handler function
     * @private
     */
    _messageFetchCallback(wiki, language, domain) {
        return function(data) {
            if (
                typeof data !== 'object' ||
                typeof data.query !== 'object' ||
                !(data.query.allmessages instanceof Array)
            ) {
                this._logger.error('Unusual MediaWiki API response', data);
                return;
            }
            const messages = {};
            data.query.allmessages.forEach(function(msg) {
                if (msg.default) {
                    messages[msg.name] = msg['*'];
                }
            });
            delete messages.mainpage;
            if (Object.entries(messages).length) {
                this._loader.updateCustom(
                    wiki,
                    language,
                    domain,
                    messages,
                    this._parser.update.bind(this._parser)
                );
            } else {
                const key = `${language}:${wiki}:${domain}`;
                this._logger.error(
                    'Message failed to parse',
                    this._fetching[key].toJSON()
                );
                delete this._fetching[key];
            }
        }.bind(this);
    }
    /**
     * Gets whether the debug mode is enabled.
     * @returns {Boolean} Whether the debug mode is enabled
     */
    get debug() {
        return this._debug;
    }
    /**
     * Gets the Redis client.
     * @returns {Redis} The Redis client shared among modules
     */
    get cache() {
        return this._cache;
    }
    /**
     * Gets the HTTP client.
     * @returns {IO} The HTTP client shared among KockaLogger components
     */
    get io() {
        return this._io;
    }
}

module.exports = Client;
