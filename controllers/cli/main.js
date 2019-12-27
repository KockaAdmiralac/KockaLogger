/**
 * main.js
 *
 * Main class for the CLI controller of KockaLogger.
 */
'use strict';

/**
 * Importing modules.
 */
const fsPromises = require('fs').promises,
      readline = require('readline'),
      commander = require('commander'),
      {Client, Loader, internal} = require('../..'),
      pkg = require('../../package.json');

/**
 * Constants.
 */
const {IO, Logger} = internal;

/**
 * Command-line interface for KockaLogger.
 */
class CLI {
    /**
     * Class constructor.
     */
    constructor() {
        this._initCLI();
        this._io = new IO();
    }
    /**
     * Runs KockaLogger.
     */
    async run() {
        await this._initConfig();
        this._initLogger();
        this._initTerminal();
        this._initLoader();
        this._initClient();
        this._initModules();
        this._initKill();
        const loaderData = await this._loader.run();
        this._client.run(loaderData);
    }
    /**
     * Sets up the command-line options.
     * This should be initialized first in case the user ran KockaLogger
     * with --version or --help.
     * @private
     */
    _initCLI() {
        this._cli = commander
            .version(pkg.version, '-v, --version')
            .option('-d, --debug', 'enable debug mode')
            .option('-f, --fetch', 're-fetch messages')
            .option('-g, --generate', 'regenerate custom messages')
            .option('-c, --config <file>', 'specify configuration file path')
            .option('--logs-dir <directory>', 'specify log directory')
            .option('--no-logs', 'disable logging to files')
            .parse(process.argv);
    }
    /**
     * Initializes the KockaLogger configuration.
     * @private
     */
    async _initConfig() {
        const path = this._cli.config || 'config.json';
        let handle = null;
        try {
            handle = await fsPromises.open(path, 'r');
            this._config = JSON.parse(await handle.readFile());
        } catch (error) {
            console.error(
                'An error occurred while opening the configuration file:',
                error
            );
        } finally {
            if (handle !== undefined) {
                await handle.close();
            }
        }
    }
    /**
     * Sets up a logger to CLI, log files and Discord.
     */
    _initLogger() {
        const {log} = this._config;
        this._logger = new Logger({
            debug: this._cli.debug || log.debug,
            dir: this._cli.logsDir || log.dir,
            discord: log.discord,
            file: !(log.noFile || this._cli.noLogs),
            io: this._io,
            level: this._cli.level || log.level,
            name: 'cli',
            stdout: true
        });
    }
    /**
     * Initializes the CLI terminal.
     * @private
     */
    _initTerminal() {
        this._tty = readline.createInterface({
            completer: this._readCompleter,
            historySize: 100,
            input: process.stdin,
            output: process.stdout,
            removeHistoryDuplicates: true
        });
    }
    /**
     * Initializes the KockaLogger loader.
     * @private
     */
    _initLoader() {
        this._loader = new Loader({
            debug: this._cli.debug,
            fetch: this._cli.fetch,
            generate: this._cli.generate
        });
    }
    /**
     * Initializes the KockaLogger client.
     * @private
     */
    _initClient() {
        this._client = new Client(this._config.client, {
            debug: this._cli.debug
        })
            .on('redis', this._onRedis.bind(this))
            .on('error', this._onError.bind(this))
            .on('registered', this._onRegistered.bind(this))
            .on('join', this._onJoin.bind(this))
            .on('kill', this._onKill.bind(this));
    }
    /**
     * Initializes KockaLogger modules.
     * @private
     */
    _initModules() {
        for (const mod in this._config.modules) {
            try {
                const {Module} = require(`../../modules/${mod}`);
                const modinst = new Module(this._config.modules[mod]);
                this._client.registerModule(mod, modinst);
            } catch (error) {
                this._logger.error(
                    'An error occurred while initializing the',
                    mod, 'module', error
                );
            }
        }
    }
    /**
     * Sets a SIGINT listener.
     * @private
     */
    _initKill() {
        process.on('SIGINT', this._kill.bind(this));
    }
    /**
     * Kills the KockaLogger process and cleans up.
     * @private
     */
    _kill() {
        if (this._killing) {
            this._logger.error(
                'KockaLogger already shutting down, please wait. ' +
                'If shutting down lasts over 60 seconds, use CTRL+Z.'
            );
            return;
        }
        this._killing = true;
        this._client.kill();
        this._logger.info('Shutting down by user request...');
        // this._logger.close(cb);
    }
    /**
     * Emitted when a Redis-related event gets detected by KockaLogger.
     * @param {string} code Event code
     * @param {Error} error The error that occurred
     * @private
     */
    _onRedis({code, error}) {
        switch (code) {
            case 'connected':
                this._logger.info('Connected to Redis.');
                break;
            case 'disconnected':
                this._logger.error('Disconnected from Redis.');
                break;
            case 'error':
                this._logger.error('Redis error:', error);
                break;
            case 'reconnecting':
                this._logger.error('Reconnecting to Redis.');
                break;
            default:
                this._logger.error('Unknown Redis event:', code);
                break;
        }
    }
    /* eslint-disable max-lines-per-function */
    /**
     * Emitted when an error occurs in KockaLogger.
     * @param {Array} args Arguments to the IRC error
     * @private
     */
    _onError({
        args, command, data, error, type, ircType, message, mod,
        domain, language, wiki, messagefetchType
    }) {
        switch (type) {
            case 'no-redis':
                this._logger.error(
                    'Redis has not started up.',
                    'Please run redis.sh before running KockaLogger'
                );
                process.exit(1);
                break;
            case 'irc':
                switch (ircType) {
                    case 'unknown':
                        this._logger.error('Unknown IRC error:', args);
                        break;
                    case 'known':
                        this._logger.error('IRC error:', command);
                        break;
                    case 'socket':
                        this._logger.error('IRC socket error:', error);
                        break;
                    default:
                        this._logger.error('Unhandled IRC error:', ircType);
                        break;
                }
                break;
            case 'newusers-overflow':
                this._logger.error(
                    'It looks like the new users log finally overflowed.',
                    message
                );
                break;
            case 'dispatch':
                this._logger.error(
                    'An error occurred while dispatching a message to the',
                    mod, 'module:', error
                );
                break;
            case 'fetch':
                this._logger.error(
                    'Fetching additional message information failed:',
                    error
                );
                break;
            case 'timeout':
                this._logger.error(
                    'An error occurred while re-fetching message information:',
                    error
                );
                break;
            case 'parse':
                if (message.type === 'error') {
                    this._logger.error(
                        'Failed to determine a message\'s type:',
                        error
                    );
                }
                break;
            case 'message':
                this._logger.error(
                    'Message to fetch messages from is invalid:',
                    error
                );
                break;
            case 'messagefetch':
                switch (messagefetchType) {
                    case 'html':
                        this._logger.error(
                            'Received an HTML response while fetching messages',
                            wiki, domain, language
                        );
                        break;
                    case 'unusual':
                        this._logger.error(
                            'Unusual MediaWiki API response:',
                            data
                        );
                        break;
                    case 'fail':
                        this._logger.error(
                            'Request error while fetching custom messages:',
                            error
                        );
                        break;
                    default:
                        this._logger.error(
                            'Unhandled message fetching error:',
                            messagefetchType
                        );
                        break;
                }
                this._logger.error(
                    'Failed to fetch custom messages:',
                    messagefetchType === 'html' ?
                        'HTML response' :
                        messagefetchType === 'unusual' ?
                            'Unusual MediaWiki API response' :
                            'Request error',
                    'for', wiki, domain, language, data
                );
                break;
            default:
                this._logger.error('Unknown error:', type);
                break;
        }
    }
    /* eslint-enable max-lines-per-function */
}

module.exports = CLI;
