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
      util = require('./util.js'),
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
    'netError',
    'message',
    'ctcp-version'
],
HANDLED_COMMANDS = [
    '338',
    'rpl_whoismodes'
],
FETCH_MAX_RETRIES = 5,
FETCH_DELAY = 10000;

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
        process.on('SIGINT', this._kill.bind(this));
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
        if (!this._killing) {
            this._logger.error('Disconnected from Redis.');
        }
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
            autoRejoin: true,
            autoRenick: true,
            channels: [
                config.channels.rc,
                config.channels.discussions,
                config.channels.newusers
            ],
            port: config.port,
            realName: config.realname,
            showErrors: true,
            userName: config.username || config.nick
        });
        this._client.out.error = this._errorOverride.bind(this);
        EVENTS.forEach(function(e) {
            this._client.on(e, this[`_${e.replace(
                /-(\w)/,
                (_, m) => m.toUpperCase()
            )}`].bind(this));
        }, this);
    }
    /**
     * Overrides irc-upd's error output.
     * @param {Array} args Error arguments
     */
    _errorOverride(...args) {
        if (
            // Bogus unhandled commands.
            args[0] === 'Unhandled message:' &&
            typeof args[1].command === 'string' &&
            (
                HANDLED_COMMANDS.includes(args[1].command) ||
                // Error while killing.
                this._killing &&
                args[1].command === 'ERROR' &&
                args[1].args instanceof Array &&
                typeof args[1].args[0] === 'string' &&
                args[1].args[0].startsWith('Closing Link: ')
            ) ||
            // Already logged errors.
            typeof args[0] === 'object' &&
            args[0].commandType === 'error'
        ) {
            return;
        }
        this._logger.error(...args);
    }
    /**
     * The client has joined the IRC server.
     * @private
     * @param {Object} command IRC command sent upon joining
     */
    _registered(command) {
        if (!this._killing) {
            this._logger.info(command.args[1]);
        }
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
                this._logger.info('Joined', type, 'channel.');
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
        this._logger.error('IRC error:', command);
    }
    /**
     * A network error with the IRC socket occurred,
     * @private
     * @param {Error} error Error event that occurred in the socket
     */
    _netError(error) {
        this._logger.error('Socket error:', error);
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
            this._logger.error('IRC message is null:', debug);
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
            message.fetch(this, properties, interested)
                .then(this._messageFetchCallback.bind(this, message))
                .catch(this._messageFetchFail.bind(this, message));
        }
    }
    /**
     * Callback after fetching additional message information.
     * @param {Message} message Message whose additional information is fetched
     * @private
     */
    _messageFetchCallback(message) {
        message.interested.forEach(function(mod) {
            try {
                this._modules[mod].execute(message);
            } catch (e) {
                this._logger.error(
                    'Dispatch error to module',
                    mod, ':', e
                );
            }
        }, this);
    }
    /**
     * Callback after fetching additional message information failed.
     * @param {Message} message Message whose additional information is fetched
     * @private
     */
    _messageFetchFail(message) {
        if (message.retries === FETCH_MAX_RETRIES) {
            this._logger.error(
                'Failed to fetch message information:',
                message.toJSON()
            );
        } else {
            message.cleanup();
            // TODO: Closure scope.
            setTimeout(function() {
                try {
                    message.fetch(this)
                        .then(this._messageFetchCallback.bind(this, message))
                        .catch(this._messageFetchFail.bind(this, message));
                    } catch (e) {
                    this._logger.error('Re-fetch timeout failure:', e);
                }
            }.bind(this), FETCH_DELAY * message.retries);
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
            if (
                typeof message.wiki !== 'string' ||
                typeof message.language !== 'string' ||
                typeof message.domain !== 'string'
            ) {
                this._logger.error(
                    'Message to fetch messages from is invalid',
                    message.toJSON()
                );
                return;
            }
            this._io.query(message.wiki, message.language, message.domain, {
                amcustomized: 'modified',
                ammessages: Object.keys(this._caches.i18n).join('|'),
                amprop: 'default',
                meta: 'allmessages'
            }).then(this._messagesFetchCallback.bind(
                this,
                message.wiki,
                message.language,
                message.domain
            )).catch(
                e => this._logger.error('Error while fetching messages', e)
            );
        }
    }
    /**
     * Creates a callback function for handling message fetching responses
     * @param {String} wiki Wiki to handle the responses from
     * @param {String} language Language of the wiki
     * @param {String} domain Domain of the wiki
     * @param {Object} data MediaWiki API response
     * @private
     */
    _messagesFetchCallback(wiki, language, domain, data) {
        if (
            typeof data !== 'object' ||
            typeof data.query !== 'object' ||
            !(data.query.allmessages instanceof Array)
        ) {
            if (
                typeof data === 'string' &&
                data.trim().toLowerCase().startsWith('<!doctype html>')
            ) {
                this._logger.error(
                    'Received an HTML response for',
                    wiki,
                    language,
                    domain
                );
            } else {
                this._logger.error('Unusual MediaWiki API response', data);
            }
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
    }
    /**
     * Handles a CTCP VERSION.
     * @param {String} from User sending the CTCP
     * @param {String} to User receiving the CTCP
     * @private
     */
    _ctcpVersion(from, to) {
        if (to === this._client.nick) {
            this._client.notice(from, `VERSION ${util.USER_AGENT}`);
        }
    }
    /**
     * Cleans up the resources after a kill has been requested.
     * @private
     */
    _kill() {
        // Clear ^C from console line.
        process.stdout.write(`${String.fromCharCode(27)}[0G`);
        if (this._killing) {
            this._logger.error(
                'KockaLogger already shutting down, please wait. ' +
                'If shutting down lasts over 60 seconds, use CTRL+Z.'
            );
            return;
        }
        const cb = this._killCallback.bind(this);
        this._killing = true;
        // Redis + logger + init.
        this._awaitingKill = 3;
        // Quit client's logger.
        this._logger.info('Shutting down by user request...');
        this._logger.close(cb);
        // Quit IRC.
        if (
            typeof this._client === 'object' &&
            typeof this._client.disconnect === 'function'
        ) {
            ++this._awaitingKill;
            this._client.disconnect('User-requested shutdown.', cb);
        }
        // Quit Redis client.
        this._cache.quit();
        // Let modules quit what they have to quit.
        for (const mod in this._modules) {
            const num = this._modules[mod].kill(cb) || 1;
            this._awaitingKill += num;
        }
        // Initialization of kill callbacks finished.
        this._killInitFinished = true;
        this._killCallback();
    }
    /**
     * Callback after cleaning up a resource.
     * @private
     */
    _killCallback() {
        if (--this._awaitingKill === 0 && this._killInitFinished) {
            process.exit();
        }
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
