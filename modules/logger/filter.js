/**
 * filter.js
 *
 * Module for filtering wiki activity
 */
'use strict';

/**
 * Class for filtering wiki activity
 */
class Filter {
    /**
     * Class constructor
     * @param {Object} config Filter configuration
     */
    constructor(config) {
        if (typeof config === 'object') {
            this._type = typeof config.type === 'string' ? config.type : 'all';
            this._transport = typeof config.transport === 'string' ?
                config.transport :
                'default';
            if (config.namespaces instanceof Array) {
                this._namespaceFilter = config.namespaces;
            }
            if (config.logs instanceof Array) {
                this._logFilter = config.logs;
            }
        } else {
            this._type = 'all';
            this._transport = 'default';
        }
        this._func = this[`_${this._type}`];
        if (typeof this._func !== 'function') {
            this._type = 'all';
            this._func = this._all;
        }
    }
    /**
     * Filters a message
     * @param {Message} message Message to filter
     * @returns {String} The transport name for the message
     */
    execute(message) {
        try {
            if (this._func(message)) {
                return this._transport;
            }
        } catch (e) {
            return false;
        }
    }
    /**
     * Filters all messages
     * @returns {Boolean} If the message should be transported
     */
    _all() {
        return true;
    }
    /**
     * Filters Discussions messages
     * @param {Message} message Message to be transported
     * @returns {Boolean} If the message is from Discussions
     */
    _discussions(message) {
        return message.type === 'discussions';
    }
    /**
     * Filters activity in social namespaces (works only on English wikis)
     * @param {Message} message Message to be transported
     * @returns {Boolean} If the message is a comment or a thread
     */
    _social(message) {
        return message.threadtitle ||
            message.type === 'edit' &&
            message.namespace === 1 ||
            message.type === 'log' &&
            message.log === 'thread';
    }
    /**
     * Filters activity in certain namespaces
     * @param {Message} message Message to be transported
     * @returns {Boolean} If the message is in the specified namespace(s)
     */
    _namespaces(message) {
        return message.type === 'edit' &&
               this._namespaceFilter &&
               this._namespaceFilter.includes(message.namespace);
    }
    /**
     * Filters activity by log type
     * @param {Message} message Message to be transported
     * @returns {Boolean} If the message is a log of specified type
     */
    _logs(message) {
        return message.type === 'log' &&
               this._logFilter &&
               this._logFilter.includes(message.log);
    }
}

module.exports = Filter;
