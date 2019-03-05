/**
 * log.js
 *
 * Provides a simple logging interface.
 */
'use strict';

/**
 * Importing modules.
 */
const fs = require('fs'),
      path = require('path');

/**
 * Constants.
 */
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'],
      DEFAULT_LOG_LEVEL = 'debug',
      DEFAULT_LOG_DIRECTORY = 'logs',
      DISCORD_ERROR = 'Discord transport error';

/**
 * Simple logging interface.
 */
class Logger {
    /**
     * Class constructor.
     * @param {String} name Logger's name
     * @param {Boolean} stdout Whether logs should be logged to standard output
     * @param {Boolean} file Whether logs should be logged to a file
     * @param {Object} discord Configuration for logging to Discord
     * @param {String} level Log level
     * @param {String} dir Directory for logs
     * @param {Boolean} debug Whether the logger itself should debug content
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
            this._url = `https://discordapp.com/api/webhooks/${discord.id}/${discord.token}`;
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
     * @param {String} level Logging level
     * @param {Boolean} debug Whether debug mode is enabled
     * @param {IO} io HTTP client
     * @param {String} dir Logging directory
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
     * @param {Number} num Color number
     * @returns {String} Console color
     */
    _color(num) {
        return `\x1b[${num}m`;
    }
    /**
     * Gets console color number for a log level.
     * @param {String} level Log level
     * @returns {Number} Console color of the log level
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
     * @param {Number} num Number to pad
     * @returns {String} Padded number
     * @private
     */
    _pad(num) {
        return String(num).padStart(2, 0);
    }
    /**
     * Logs specified messages with the specified level.
     * @param {String} level Log level
     * @param {Array} messages Messages to log
     * @private
     */
    _log(level, ...messages) {
        if (typeof level !== 'string') {
            throw new Error('Invalid log level!');
        }
        if (LOG_LEVELS.indexOf(level) < this._level) {
            return;
        }
        const now = new Date(),
              str = messages.map(this._mapFile).join(' '),
              dstr = messages.map(this._mapDiscord).join(' '),
              date = `${this._pad(now.getDate())}-${this._pad(now.getMonth() + 1)}-${now.getFullYear()}`,
              time = `${this._pad(now.getHours())}:${this._pad(now.getMinutes())}:${this._pad(now.getSeconds())}`,
              logLevel = level.toUpperCase(),
              levelColor = this._color(this._colorLevel(logLevel));
        if (this._console) {
            console[level](`${this._color(34)}[${this._name}]${this._color(2)}[${date} ${time}]${this._color(0)} ${levelColor}[${logLevel}]${this._color(0)}`, ...messages);
        }
        if (this._stream) {
            this._stream.write(`[${date} ${time}] [${logLevel}] ${str}\n`);
        }
        if (this._url && !dstr.startsWith(DISCORD_ERROR)) {
            Logger._io.webhook(this._url, {
                // CAUTION: May contain mentions
                content: `**${logLevel}:** ${dstr}`
            }).catch(e => this.error(
                DISCORD_ERROR,
                e.statusCode === 429 ?
                    '| Rate limited!' :
                    e.error
            ));
        }
    }
    /**
     * Maps objects to how they should be represented in logfiles.
     * @param {*} msg Message to map
     * @returns {String} String representation of the message
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
                } catch (e) {
                    return '[Circular?]';
                }
        }
    }
    /**
     * Maps objects to how they should be represented in Discord.
     * @param {*} msg Message to map
     * @returns {String} String representation of the message
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
                } catch (e) {
                    return '`[Circular?]`';
                }
        }
    }
    /**
     * Closes all open resources.
     * @param {Function} callback Callback to call after closing
     */
    close(callback) {
        if (this._stream) {
            this._stream.close();
            delete this._stream;
        }
        callback();
    }
    /**
     * Debugs specified messages.
     * @param {Array<String>} messages Messages to debug
     */
    debug(...messages) {
        this._log('debug', ...messages);
    }
    /**
     * Outputs specified information.
     * @param {Array<String>} messages Information to output
     */
    info(...messages) {
        this._log('info', ...messages);
    }
    /**
     * Outputs specified warnings.
     * @param {Array<String>} messages Warnings to output
     */
    warn(...messages) {
        this._log('warn', ...messages);
    }
    /**
     * Outputs specified errors.
     * @param {Array<String>} messages Errors to output
     */
    error(...messages) {
        this._log('error', ...messages);
    }
}

module.exports = Logger;
