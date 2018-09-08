/**
 * log.js
 *
 * Provides a simple logging interface
 */
'use strict';

/**
 * Importing modules
 */
const fs = require('fs'),
      io = require('./io.js');

/**
 * Simple logging interface
 */
class Logger {
    /**
     * Class constructor
     */
    constructor({name, stdout, file, discord}) {
        if (typeof name !== 'string') {
            throw new Error('Log must have a name!');
        }
        this._name = name;
        this._console = stdout;
        if (file) {
            this._stream = fs.createWriteStream(`logs/${name}.log`, {
                flags: 'a'
            });
        }
        if (typeof discord === 'object') {
            this._url = `https://discordapp.com/api/webhooks/${discord.id}/${discord.token}`;
        }
        if (!this._console && !this._stream && !this._url) {
            throw new Error('No logging route specified!');
        }
    }
    /**
     * Formats a console color based on color number
     * @param {Number} num Color number
     * @returns {String} Console color
     */
    _color(num) {
        return `\x1b[${num}m`;
    }
    /**
     * Gets console color number for a log level
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
            // Error - red background
            case 'ERROR': return 41;
            // Dunno - reset color
            default: return 0;
        }
    }
    /**
     * Pads a number to two digits in length
     * @param {Number} num Number to pad
     * @returns {String} Padded number
     * @private
     */
    _pad(num) {
        return String(num).padStart(2, 0);
    }
    /**
     * Logs specified messages with the specified level
     * @param {String} level Log level
     * @param {Array<String>} messages Messages to log
     * @private
     */
    _log(level, ...messages) {
        if (typeof level !== 'string') {
            throw new Error('Invalid log level!');
        }
        const now = new Date(),
              str = messages.map(function(msg) {
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
                          return JSON.stringify(msg);
                  }
              }).join(' '),
              date = `${this._pad(now.getDate())}-${this._pad(now.getMonth() + 1)}-${now.getFullYear()}`,
              time = `${this._pad(now.getHours())}-${this._pad(now.getMinutes())}-${this._pad(now.getSeconds())}`,
              logLevel = level.toUpperCase(),
              levelColor = this._color(this._colorLevel(logLevel));
        if (this._console) {
            console.log(`${this._color(34)}[${this._name}]${this._color(2)}[${date} ${time}]${this._color(0)} ${levelColor}[${logLevel}]${this._color(0)}`, ...messages);
        }
        if (this._stream) {
            this._stream.write(`[${date} ${time}] [${logLevel}] ${str}\n`);
        }
        if (this._url) {
            io.webhook(this._url, {
                // CAUTION: May contain mentions
                content: `**${logLevel}** ${str}`
            });
        }
    }
    /**
     * Debugs specified messages
     * @param {Array<String>} messages Messages to debug
     */
    debug(...messages) {
        this._log('debug', ...messages);
    }
    /**
     * Outputs specified information
     * @param {Array<String>} messages Information to output
     */
    info(...messages) {
        this._log('info', ...messages);
    }
    /**
     * Outputs specified errors
     * @param {Array<String>} messages Errors to output
     */
    error(...messages) {
        this._log('error', ...messages);
    }
}

module.exports = Logger;
