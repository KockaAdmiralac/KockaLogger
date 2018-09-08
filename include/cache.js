/**
 * cache.js
 *
 * Base module for file-based caching
 */
'use strict';

/**
 * Importing modules
 */
const fs = require('fs'),
      Logger = require('./log.js');

/**
 * Constants
 */
const CACHE_DIRECTORY = 'cache',
      DEFAULT_CACHE_EXPIRY = 60000;

/**
 * Cache provider
 */
class Cache {
    /**
     * Class constructor
     * @param {String} name Cache's filename
     * @param {Number} save Interval on which to save the cache
     * @param {Number} expiry Time after cache entries expire
     * @param {Number} check Interval on which to check for cache expiry
     */
    constructor({name, save, expiry, check, debug, pop}) {
        this._data = {};
        this._name = typeof name === 'string' ? name : null;
        this._expiry = typeof expiry === 'number' ?
            expiry :
            DEFAULT_CACHE_EXPIRY;
        this._debugMode = Boolean(debug);
        if (this._debugMode) {
            this._logger = new Logger({
                file: true,
                name: 'cache'
            });
        }
        if (this._name && typeof save === 'number') {
            this._saveInterval = setInterval(this._save.bind(this), save);
        }
        if (typeof check === 'number') {
            this._checkInterval = setInterval(this._check.bind(this), check);
        }
        this._pop = typeof pop === 'function' ? pop : null;
    }
    /**
     * Saves the cache to a file
     * @private
     */
    _save() {
        this._saving = true;
        fs.writeFile(
            `${CACHE_DIRECTORY}/${this._name}.json`,
            this._debugMode ?
                JSON.stringify(this._data, null, '    ') :
                JSON.stringify(this._data),
            this._cbSave.bind(this)
        );
    }
    /**
     * Saves the cache to a file
     * @returns {Promise} Promise to listen on when the cache is saved
     */
    save() {
        return new Promise(function(resolve, reject) {
            this._resolve = resolve;
            this._reject = reject;
            if (!this._saving) {
                this._save();
            }
        }.bind(this));
    }
    /**
     * Save callback
     * @param {Error} e Error, if it occurred
     * @private
     */
    _cbSave(e) {
        if (this._dispose) {
            clearInterval(this._checkInterval);
            if (this._saveInterval) {
                clearInterval(this._saveInterval);
            }
            this._data = {};
        }
        if (e) {
            if (typeof this._reject === 'function') {
                this._reject(e);
            } else {
                this._debug('error', 'Cache save error:', e);
            }
        } else if (typeof this._resolve === 'function') {
            this._resolve(e);
        }
    }
    /**
     * Checks all entries for removal
     * @private
     */
    _check() {
        const now = Date.now();
        let number = 0;
        for (const i in this._data) {
            if (now - this._data[i].touched > this._expiry) {
                if (this._pop) {
                    this._pop(i, this._data[i].value);
                }
                ++number;
                delete this._data[i];
            }
        }
        if (number > 0) {
            this._debug('info', number, 'entries cleaned from cache');
        }
    }
    /**
     * Loads the cache from a file
     */
    load() {
        try {
            this._data = require(`../${CACHE_DIRECTORY}/${this._name}.json`);
        } catch (e) {
            this._debug('info', this._name, 'cache created anew');
        }
    }
    /**
     * Gets a cache entry
     * @param {String} key Cache entry key
     * @returns {*} Cache entry
     * @private
     */
    get(key) {
        if (typeof this._data[key] !== 'object') {
            this._debug('debug', 'Cache miss for', key);
            return null;
        }
        this._data[key].touched = Date.now();
        return this._data[key].value;
    }
    /**
     * Sets a cache entry
     * @param {String} key Cache entry key
     * @param {String} value Cache entry value
     */
    set(key, value) {
        this._data[key] = {
            touched: Date.now(),
            value
        };
    }
    /**
     * Deletes a cache entry
     * @param {String} key Cache entry key
     */
    delete(key) {
        if (this._data[key]) {
            delete this._data[key];
        }
    }
    /**
     * Logs debug output to stdout if in debug mode
     * @param {String} level Log level
     * @param {Array<String>} messages Content to log
     * @private
     */
    _debug(level, ...messages) {
        if (this._debugMode) {
            this._logger[level](...messages);
        }
    }
}

module.exports = Cache;
