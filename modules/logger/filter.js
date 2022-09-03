/**
 * filter.js
 *
 * Module for filtering wiki activity.
 */
'use strict';

const Message = require('../../parser/msg.js');

/**
 * Class for filtering wiki activity.
 */
class Filter {
    /**
     * Class constructor.
     * @param {object} config Filter configuration
     */
    constructor(config) {
        if (typeof config === 'object' && config) {
            const {
                type, transport, negation, namespaces, logs, options
            } = config;
            this._type = typeof type === 'string' ? type : 'all';
            this._transport = typeof transport === 'string' ?
                transport :
                'default';
            this._negation = typeof negation === 'boolean' ? negation : false;
            if (namespaces instanceof Array) {
                this._namespaceFilter = namespaces;
            }
            if (logs instanceof Array) {
                this._logFilter = logs;
            }
            if (typeof options === 'object') {
                this._options = options;
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
     * Filters a message.
     * @param {Message} message Message to filter
     * @returns {string} The transport name for the message
     */
    execute(message) {
        try {
            if (this._func(message) !== this._negation) {
                return this._transport;
            }
        } catch (_error) {
            // TODO: Log failure
            return false;
        }
    }
    /**
     * Filters all messages.
     * @returns {boolean} If the message should be transported
     */
    _all() {
        return true;
    }
    /**
     * Filters Discussions messages.
     * @param {Message} message Message to be transported
     * @returns {boolean} If the message is from Discussions
     */
    _discussions(message) {
        return message.type === 'discussions' &&
               message.platform === 'discussion';
    }
    /**
     * Filters out Discussions messages.
     * @param {Message} message Message to be transported
     * @returns {boolean} If the message is not from Discussions
     */
    _noDiscussions(message) {
        return !this._discussions(message);
    }
    /**
     * Filters Discussions messages but without replies unless they aren't
     * created or edited.
     * @param {Message} message Message to be transported
     * @returns {boolean} If the above conditions are met
     */
    _noreply(message) {
        return message.type === 'discussions' &&
               message.platform === 'discussion' &&
               (
                   message.dtype !== 'post' ||
                       message.action !== 'edited' &&
                       message.action !== 'created'
               );
    }
    /**
     * Filters activity in certain namespaces.
     * @param {Message} message Message to be transported
     * @returns {boolean} If the message is in the specified namespace(s)
     */
    _namespaces(message) {
        return message.type === 'edit' &&
               this._namespaceFilter &&
               this._namespaceFilter.includes(message.namespace);
    }
    /**
     * Filters activity by log type.
     * @param {Message} message Message to be transported
     * @returns {boolean} If the message is a log of specified type
     */
    _logs(message) {
        return message.type === 'log' &&
               this._logFilter &&
               this._logFilter.includes(message.log);
    }
    /**
     * Filters activity by message fields.
     *
     * This filter works by specifying message field keys as keys to the
     * `options` property, and possible message field values as values,
     * either as single values or arrays of values (array of value as the)
     * value in the `options` property means either of these values will be
     * matched.
     * @param {Message} message Message to be transported
     * @returns {boolean} If the message matches specified rules
     */
    _advanced(message) {
        for (const [property, values] of Object.entries(this._options)) {
            const isArray = Array.isArray(values);
            const value = message[property];
            const matchesIfArray = isArray && values.includes(value);
            const matchesIfNotArray = !isArray && value === values;
            const matches = matchesIfArray || matchesIfNotArray;
            if (!matches) {
                return false;
            }
        }
        return true;
    }
}

module.exports = Filter;
