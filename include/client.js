/**
 * main.js
 *
 * Main controller of KockaLogger components.
 * @module wikia-rc/client
 */
'use strict';

/**
 * Importing modules
 */
const {EventEmitter} = require('events'),
      bluebird = require('bluebird'),
      irc = require('irc-upd'),
      redis = require('redis'),
      util = require('./util.js'),
      IO = require('./io.js'),
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
class Client extends EventEmitter {
    /**
     * Class constructor.
     * @param {object} config KockaLogger configuration
     * @param {boolean} debug KockaLogger debug mode
     * @param {Loader} loader Loader instance
     */
    constructor(config, {debug}, loader) {
        super();
        this._config = config;
        this._debug = debug;
        this._loader = loader;
        this._io = new IO();
        this._fetching = {};
        this._modules = {};
        this._initCache();
    }
    /**
     * Initializes a Redis client used for caching.
     * @private
     */
    _initCache() {
        bluebird.promisifyAll(redis.RedisClient.prototype);
        bluebird.promisifyAll(redis.Multi.prototype);
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
        this.emit('redis', {
            code: 'connected'
        });
    }
    /**
     * Event emitted when the Redis client connects.
     * @private
     */
    _redisDisconnected() {
        if (!this._killing) {
            this.emit('redis', {
                code: 'disconnected'
            });
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
                this.emit('error', {
                    type: 'no-redis'
                });
                process.exit();
            } else {
                this.emit('redis', {
                    code: 'error',
                    error
                });
            }
        }
    }
    /**
     * Event emitted when Redis starts attempting to reconnect.
     * @private
     */
    _redisReconnecting() {
        this.emit('redis', {
            code: 'reconnecting'
        });
    }
    /**
     * Registers a module into KockaLogger.
     * @param {string} name Name of the module
     * @param {object} mod Instance of the module
     */
    registerModule(name, mod) {
        mod.register(this);
        this._modules[name] = mod;
    }
    /**
     * Deregisters a module from KockaLogger.
     * @param {string} name Name of the module
     */
    deregisterModule(name) {
        delete this._modules[name];
    }
    /**
     * Initializes the IRC client.
     * @param {object} data Loader data
     */
    run(data) {
        this._caches = data;
        this._parser = new Parser(this, data);
        for (const mod in this._modules) {
            this._modules[mod].setup(data);
        }
        this._client = new irc.Client(this._config.server, this._config.nick, {
            autoRejoin: true,
            autoRenick: true,
            channels: [
                this._config.channels.rc,
                this._config.channels.discussions,
                this._config.channels.newusers
            ],
            port: this._config.port,
            realName: this._config.realname,
            showErrors: true,
            userName: this._config.username || this._config.nick
        });
        this._client.out.error = this._errorOverride.bind(this);
        EVENTS.forEach(function(e) {
            this._client.on(e, this[`_${e.replace(
                /-(\w)/u,
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
        this.emit('error', {
            args,
            ircType: 'unknown',
            type: 'irc'
        });
    }
    /**
     * The client has joined the IRC server.
     * @private
     * @param {object} command IRC command sent upon joining
     */
    _registered(command) {
        if (!this._killing) {
            this.emit('registered', command.args[1]);
        }
    }
    /**
     * The client has joined an IRC channel.
     * @private
     * @param {string} channel Channel that was joined
     * @param {string} user User that joined the channel
     */
    _join(channel, user) {
        for (const type in this._config.channels) {
            if (
                channel === this._config.channels[type] &&
                user === this._config.nick
            ) {
                this.emit('join', type);
                break;
            }
        }
    }
    /**
     * An IRC error occurred.
     * @private
     * @param {object} command IRC command sent upon error
     */
    _error(command) {
        this.emit('error', {
            command,
            ircType: 'known',
            type: 'irc'
        });
    }
    /**
     * A network error with the IRC socket occurred.
     * @private
     * @param {Error} error Error event that occurred in the socket
     */
    _netError(error) {
        this.emit('error', {
            error,
            ircType: 'socket',
            type: 'irc'
        });
    }
    /**
     * An IRC message has been sent.
     * @private
     * @param {string} user User sending the message
     * @param {string} channel Channel the message was sent to
     * @param {string} message Message contents
     */
    async _message(user, channel, message) {
        for (const i in this._config.channels) {
            if (
                user.startsWith(this._config.users[i]) &&
                channel === this._config.channels[i]
            ) {
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
     * @param {string} message Message to handle
     * @returns {module:wikia-rc~Message} Parsed message object
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
     * @param {string} message Message to handle
     * @returns {module:kocka-logger~Message} Parsed message object
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
     * @param {string} message Message to handle
     * @returns {Message} Parsed message object
     * @private
     */
    _newusersMessage(message) {
        if (message.endsWith('newusers')) {
            return this._parser.parse(message, 'newusers');
        }
        this.emit('error', {
            message,
            type: 'newusers-overflow'
        });
    }
    /**
     * Dispatches the message to modules.
     * @param {Message} message Message to dispatch
     * @private
     */
    async _dispatchMessage(message) {
        const {interested, properties} = this._checkInterest();
        if (properties.length > 0) {
            await this._fetchMessage(message, properties, interested);
        }
    }
    /**
     * Checks interest of all registered modules on a message and immediately
     * dispatches it if no message properties are requested.
     * @param {Message} message Message for which the interest should be checked
     * @returns {object} Interested modules and properties to fetch
     * @private
     */
    _checkInterest(message) {
        const properties = [],
              interested = [];
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
                    properties.push(...interest);
                    interested.push(mod);
                }
            } catch (error) {
                this.emit('error', {
                    error,
                    mod,
                    type: 'dispatch'
                });
            }
        }
        return {
            interested,
            properties
        };
    }
    /**
     * Executes a message fetching and dispatching fetched messages.
     * Re-called after a failed fetching.
     * @param {Message} message Message to be fetched
     * @param {Array<string>} properties Properties to be fetched
     * @param {Array<Module>} interested Modules interested in the message
     * @private
     */
    async _fetchMessage(message, properties, interested) {
        try {
            await message.fetch(this, properties);
            interested.forEach(function(mod) {
                try {
                    this._modules[mod].execute(message);
                } catch (error) {
                    this.emit('error', {
                        error,
                        mod,
                        type: 'dispatch'
                    });
                }
            }, this);
        } catch (error) {
            if (message.retries === FETCH_MAX_RETRIES) {
                this.emit('error', {
                    message,
                    type: 'fetch'
                });
            } else {
                message.cleanup();
                setTimeout(
                    this._fetchMessage.bind(
                        this,
                        message,
                        properties,
                        interested
                    ),
                    FETCH_DELAY * message.retries
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
            this.emit('error', {
                message,
                type: 'parse'
            });
            return;
        }
        const key = `${message.language}:${message.wiki}:${message.domain}`;
        if (this._fetching[key]) {
            return;
        }
        this._fetching[key] = true;
        if (
            typeof message.wiki !== 'string' ||
            typeof message.language !== 'string' ||
            typeof message.domain !== 'string'
        ) {
            this.emit('error', {
                message,
                type: 'message'
            });
            return;
        }
        try {
            // NOTE: This only works while logged out due to amlang.
            const data = await this._io.query(
                message.wiki,
                message.language,
                message.domain,
                {
                    amcustomized: 'modified',
                    ammessages: Object.keys(this._caches.i18n).join('|'),
                    amprop: 'default',
                    meta: 'allmessages'
                }
            );
            this._handleCustomMessages(message, key, data);
        } catch (error) {
            this.emit('error', {
                error,
                messagefetchType: 'fail',
                type: 'messagefetch'
            });
            delete this._fetching[key];
        }
    }
    /**
     * Handles custom messages that were fetched as a result of
     * a failed log parsing.
     * @param {Message} message The message whose log failed to parse
     * @param {string} key The key the message was being fetched under
     * @param {object} data MediaWiki API response
     * @private
     */
    _handleCustomMessages(message, key, data) {
        if (
            typeof data !== 'object' ||
            typeof data.query !== 'object' ||
            !(data.query.allmessages instanceof Array)
        ) {
            if (
                typeof data === 'string' &&
                data.trim().toLowerCase().startsWith('<!doctype html>')
            ) {
                this.emit('error', {
                    message,
                    messagefetchType: 'html',
                    type: 'messagefetch'
                });
            } else {
                this.emit('error', {
                    data,
                    messagefetchType: 'unusual',
                    type: 'messagefetch'
                });
            }
        } else {
            const messages = {};
            data.query.allmessages.forEach(function(msg) {
                if (msg.default) {
                    messages[msg.name] = msg['*'];
                }
            });
            delete messages.mainpage;
            if (Object.entries(messages).length) {
                this._loader.updateCustom(
                    message.wiki,
                    message.language,
                    message.domain,
                    messages,
                    this._parser.update.bind(this._parser)
                );
            } else {
                this.emit('error', {
                    message,
                    type: 'parse'
                });
            }
        }
        delete this._fetching[key];
    }
    /**
     * Handles a CTCP VERSION.
     * @param {string} from User sending the CTCP
     * @param {string} to User receiving the CTCP
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
    kill() {
        const cb = this._killCallback.bind(this);
        this._killing = true;
        // Redis + init.
        this._awaitingKill = 2;
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
            this.emit('kill');
        }
    }
    /**
     * Gets whether the debug mode is enabled.
     * @returns {boolean} Whether the debug mode is enabled
     */
    get debug() {
        return this._debug;
    }
    /**
     * Gets the Redis client.
     * @returns {redis~RedisClient} The Redis client shared among modules
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
