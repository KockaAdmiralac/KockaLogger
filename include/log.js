/**
 * log.js
 *
 * Provides a simple logging interface.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {WebhookClient} = require('discord.js');
const IO = require('./io.js');

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const DEFAULT_LOG_LEVEL = 'debug';
const DEFAULT_LOG_DIRECTORY = 'logs';

/**
 * Simple logging interface.
 */
class Logger {
    /**
     * Class constructor.
     * @param {object} options Logger options
     * @param {string} options.name Logger's name
     * @param {boolean} options.stdout Whether logs should be logged to standard
     * output
     * @param {boolean} options.file Whether logs should be logged to a file
     * @param {object} options.discord Configuration for logging to Discord
     * @param {string} options.level Log level
     * @param {string} options.dir Directory for logs
     * @param {boolean} options.debug Whether the logger itself should debug
     * content
     */
    constructor({name, stdout, file, discord, level, dir, debug}) {
        if (typeof name !== 'string') {
            throw new Error('Log must have a name!');
        }
        this._name = name;
        this._level = level || Logger._level;
        this._console = stdout;
        if (file) {
            this._stream = fs.createWriteStream(
                path.resolve(`${dir || Logger._dir}/${name}.log`),
                {flags: 'a'}
            );
        }
        if (typeof discord === 'object') {
            this._webhook = new WebhookClient({
                id: discord.id,
                token: discord.token
            });
        }
        if (!this._console && !this._stream && !this._url) {
            throw new Error('No logging route specified!');
        }
        if (debug || Logger._debug) {
            this._level = LOG_LEVELS.indexOf('debug');
        }
    }
    /**
     * Sets up global logging configuration.
     * @param {object} options Setup options
     * @param {string} options.level Logging level
     * @param {string} options.dir Logging directory
     * @param {boolean} debug Whether debug mode is enabled
     * @param {IO} io HTTP client
     * @static
     */
    static setup({level, dir}, debug, io) {
        this._level = LOG_LEVELS.indexOf(level || DEFAULT_LOG_LEVEL);
        this._dir = dir || DEFAULT_LOG_DIRECTORY;
        this._debug = debug;
        this._io = io;
    }
    /**
     * Formats a console color based on color number.
     * @param {number} num Color number
     * @returns {string} Console color
     */
    _color(num) {
        return `\x1b[${num}m`;
    }
    /**
     * Gets console color number for a log level.
     * @param {string} level Log level
     * @returns {number} Console color of the log level
     * @private
     */
    _colorLevel(level) {
        switch (level) {
            // Debug - yellow text
            case 'DEBUG': return 33;
            // Info  - magenta text
            case 'INFO': return 35;
            // Warning - yellow background
            case 'WARN': return 43;
            // Error - red background
            case 'ERROR': return 41;
            // Dunno - reset color
            default: return 0;
        }
    }
    /**
     * Pads a number to two digits in length.
     * @param {number} num Number to pad
     * @returns {string} Padded number
     * @private
     */
    _pad(num) {
        return String(num).padStart(2, 0);
    }
    /**
     * Logs specified messages with the specified level.
     * @param {string} level Log level
     * @param {Array} messages Messages to log
     * @private
     */
    async _log(level, ...messages) {
        if (typeof level !== 'string') {
            throw new Error('Invalid log level!');
        }
        if (LOG_LEVELS.indexOf(level) < this._level) {
            return;
        }
        const now = new Date();
        const str = messages.map(this._mapFile).join(' ');
        const dstr = messages.map(this._mapDiscord).join(' ');
        const date = `${this._pad(now.getDate())}-${this._pad(now.getMonth() + 1)}-${now.getFullYear()}`;
        const time = `${this._pad(now.getHours())}:${this._pad(now.getMinutes())}:${this._pad(now.getSeconds())}`;
        const logLevel = level.toUpperCase();
        const levelColor = this._color(this._colorLevel(logLevel));
        if (this._console) {
            // eslint-disable-next-line no-console
            console[level](`${this._color(34)}[${this._name}]${this._color(2)}[${date} ${time}]${this._color(0)} ${levelColor}[${logLevel}]${this._color(0)}`, ...messages);
        }
        if (this._stream) {
            this._stream.write(`[${date} ${time}] [${logLevel}] ${str}\n`);
        }
        if (this._webhook) {
            await this._webhook.send(`**${logLevel}:** ${dstr}`);
        }
    }
    /**
     * Maps objects to how they should be represented in logfiles.
     * @param {*} msg Message to map
     * @returns {string} String representation of the message
     */
    _mapFile(msg) {
        const type = typeof msg;
        switch (type) {
            case 'string':
                return msg;
            case 'number':
            case 'boolean':
                return String(msg);
            case 'function':
                return msg.toString();
            case 'undefined':
                return 'undefined';
            default:
                try {
                    return JSON.stringify(msg);
                } catch (_error) {
                    return '[Circular?]';
                }
        }
    }
    /**
     * Maps objects to how they should be represented in Discord.
     * @param {*} msg Message to map
     * @returns {string} String representation of the message
     */
    _mapDiscord(msg) {
        const type = typeof msg;
        switch (type) {
            case 'string':
                return msg;
            case 'number':
            case 'boolean':
                return `\`${String(msg)}\``;
            case 'function':
                return `\`\`\`javascript\n${msg.toString()}\`\`\``;
            case 'undefined':
                return '`undefined`';
            default:
                if (msg === null) {
                    return '`null`';
                }
                try {
                    return `\`\`\`json\n${JSON.stringify(msg)}\`\`\``;
                } catch (_error) {
                    return '`[Circular?]`';
                }
        }
    }
    /**
     * Closes all open resources.
     */
    close() {
        if (this._stream) {
            this._stream.close();
            delete this._stream;
        }
        if (this._webhook) {
            this._webhook.destroy();
            delete this._webhook;
        }
    }
    /**
     * Debugs specified messages.
     * @param {string[]} messages Messages to debug
     */
    async debug(...messages) {
        await this._log('debug', ...messages);
    }
    /**
     * Outputs specified information.
     * @param {string[]} messages Information to output
     */
    async info(...messages) {
        await this._log('info', ...messages);
    }
    /**
     * Outputs specified warnings.
     * @param {string[]} messages Warnings to output
     */
    async warn(...messages) {
        await this._log('warn', ...messages);
    }
    /**
     * Outputs specified errors.
     * @param {string[]} messages Errors to output
     */
    async error(...messages) {
        await this._log('error', ...messages);
    }
}

module.exports = Logger;
