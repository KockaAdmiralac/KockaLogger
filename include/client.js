/**
 * main.js
 *
 * Main controller of KockaLogger components.
 */
'use strict';

/**
 * Importing modules
 */
const {promisify} = require('util'),
      irc = require('irc-upd'),
      Redis = require('ioredis'),
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
    constructor(config, {debug}) {
        this._config = config;
        this._debug = debug;
        this._io = new IO();
        this._fetching = new Map();
        this._initLogger(config.logging || {}, config.client.discord);
        this._initCache(config.cache);
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
     * @param {Object} config Redis client configuration
     * @private
     */
    _initCache(config) {
        this._cache = new Redis(config || '/tmp/redis_kockalogger.sock')
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
     * @param {Loader} loader Message loader
     */
    async run(data, loader) {
        this._caches = data;
        this._loader = loader;
        this._parser = new Parser(this, data);
        this._logger.info('Setting up modules...');
        for (const mod in this._modules) {
            await this._modules[mod].setup(data);
        }
        this._logger.info('Initializing IRC client...');
        const {
            server, nick, channels, port, realname, username
        } = this._config.client;
        this._client = new irc.Client(server, nick, {
            autoRejoin: true,
            autoRenick: true,
            channels: [channels.rc, channels.discussions, channels.newusers],
            port,
            realName: realname,
            showErrors: true,
            userName: username || nick
        });
        this._client.out.error = this._errorOverride.bind(this);
        for (const e of EVENTS) {
            this._client.on(e, this[`_${e.replace(
                /-(\w)/,
                (_, m) => m.toUpperCase()
            )}`].bind(this));
        }
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
     */
    async _message(user, channel, message) {
        for (const i in this._config.client.channels) {
            const {channels, users} = this._config.client;
            if (user.startsWith(users[i]) && channel === channels[i]) {
                const msg = this[`_${i}Message`](message);
                if (msg && typeof msg === 'object') {
                    if (msg.error) {
                        await this._dispatchError(msg);
                    } else {
                        await this._dispatchMessage(msg);
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
                    if (msg) {
                        msg.addedSpaces = true;
                    }
                }
            }
            this._overflow = '';
        }
        // This is a UCP bug where the URL isn't included in log messages.
        if (msg && !msg.wiki) {
            /*
             * You might want to use this for debugging:
             *if (
             *    msg.error &&
             *    ![
             *        'ro-tournament',
             *        'ro-news',
             *        'curseprofile',
             *        'review',
             *        'thanks',
             *        'cargo',
             *        'import'
             *    ].includes(msg.log)
             *) {
             *    console.info(msg.toJSON());
             *}
             */
            return null;
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
            return this._parser.parse(`${overflow}${message}`, 'discussions');
        } else if (this._dOverflow) {
            this._dOverflow = `${this._dOverflow}${message}`;
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
    async _dispatchMessage(message) {
        const interested = [],
              properties = [];
        for (const mod in this._modules) {
            try {
                const m = this._modules[mod],
                      interest = m.interested(message);
                if (interest === true) {
                    await m.execute(message);
                } else if (typeof interest === 'string') {
                    properties.push(interest);
                    interested.push(mod);
                } else if (interest instanceof Array) {
                    properties.push(...interest);
                    interested.push(mod);
                }
            } catch (e) {
                this._logger.error(
                    'Dispatch error to module',
                    mod, ':', e
                );
            }
        }
        await this._fetchMessage(message, properties, interested);
    }
    /**
     * Fetches additional information about a message.
     * @param {Message} message Message whose information should be fetched
     * @param {Array<String>} properties Additional information to fetch
     * @param {Array<Module>} interested Modules interested in that information
     */
    async _fetchMessage(message, properties, interested) {
        if (properties.length === 0) {
            return;
        }
        let successful = false;
        const errors = [],
              wait = promisify(setTimeout);
        for (let retry = 0; retry < FETCH_MAX_RETRIES; ++retry) {
            await wait(retry * FETCH_DELAY);
            try {
                await message.fetch(this, properties);
                successful = true;
                break;
            } catch (error) {
                errors.push(error);
                message.cleanup();
            }
        }
        if (!successful) {
            this._logger.error(
                'Failed to fetch message information:',
                message.toJSON(),
                errors
            );
            return;
        }
        for (const mod of interested) {
            try {
                await this._modules[mod].execute(message);
            } catch (error) {
                this._logger.error(
                    'Dispatch error to module',
                    mod, ':', error
                );
            }
        }
    }
    /**
     * Dispatches a message that failed to parse.
     * @param {Message} message Message that failed to parse
     * @private
     */
    async _dispatchError(message) {
        if (message.type === 'error') {
            this._logger.error(
                'Message failed to parse (early stages)',
                message.toJSON()
            );
            return;
        }
        const {language, wiki, domain} = message,
              key = `${language}:${wiki}:${domain}`;
        if (
            typeof wiki !== 'string' ||
            typeof language !== 'string' ||
            typeof domain !== 'string'
        ) {
            this._logger.error(
                'Message to fetch messages from is invalid',
                message.toJSON()
            );
            return;
        }
        if (this._fetching.has(key)) {
            return;
        }
        this._fetching.set(key, message);
        try {
            // NOTE: This only works while logged out due to amlang.
            const data = await this._io.query(wiki, language, domain, {
                amcustomized: 'modified',
                ammessages: Object.keys(this._caches.i18n).join('|'),
                amprop: 'default',
                meta: 'allmessages'
            }), {query} = data;
            if (!query || !(query.allmessages instanceof Array)) {
                this._logger.error('Unusual MediaWiki API response', data);
            } else {
                await this._updateCustomMessages(query.allmessages, key);
            }
            this._fetching.delete(key);
        } catch (error) {
            this._logger.error('Error while fetching messages', error);
            this._fetching.delete(key);
        }
    }
    /**
     * Updates custom messages with newly fetched data.
     * @param {Object} allmessages MediaWiki API response
     * @param {String} key Serialized wiki information
     */
    async _updateCustomMessages(allmessages, key) {
        const messages = {};
        for (const msg of allmessages) {
            if (msg.default) {
                messages[msg.name] = msg['*'];
            }
        }
        delete messages.mainpage;
        if (Object.entries(messages).length) {
            await this._loader.updateCustom(key, messages);
        } else {
            this._logger.error(
                'Message failed to parse',
                this._fetching.get(key).toJSON()
            );
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
    async kill() {
        // Clear ^C from console line.
        process.stdout.write(`${String.fromCharCode(27)}[0G`);
        if (this._killing) {
            this._logger.error(
                'KockaLogger already shutting down, please wait. ' +
                'If shutting down lasts over 15 seconds, press again.'
            );
            return;
        }
        this._killing = true;
        // Quit client's logger.
        this._logger.info('Shutting down by user request...');
        this._logger.close();
        // Quit IRC.
        if (
            typeof this._client === 'object' &&
            typeof this._client.disconnect === 'function'
        ) {
            await promisify(this._client.disconnect)
                .call(this._client, 'User-requested shutdown.');
        }
        // Quit Redis client.
        await this._cache.quit();
        // Let modules quit what they have to quit.
        for (const mod in this._modules) {
            await this._modules[mod].kill();
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
