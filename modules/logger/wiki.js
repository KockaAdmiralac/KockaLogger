/**
 * wiki.js
 *
 * Module for wiki data handling.
 */
'use strict';

const Logger = require('../../include/log.js');
const Filter = require('./filter.js');
const Format = require('../../formats/format.js');
const Message = require('../../parser/msg.js');
const Transport = require('../../transports/transport.js');

const DEFAULT_BOTS = [
    'Fandom',
    'FandomBot',
    'FANDOM',
    'FANDOMbot',
    'Wikia',
    'WikiaBot'
];

/**
 * Container for wiki data.
 */
class Wiki {
    /**
     * Class constructor.
     * @param {object} config Wiki configuration
     */
    constructor(config) {
        this._logger = new Logger({
            file: true,
            name: 'wiki',
            stdout: true
        });
        if (typeof config !== 'object' || typeof config.wiki !== 'string') {
            this._logger.error('Wiki configuration invalid:', config);
            return;
        }
        const {
            wiki, domain, bots, language, transports, transport, formats,
            format, filters
        } = config;
        this._name = wiki;
        this._domain = domain || 'fandom.com';
        this._bots = bots instanceof Array ? bots : DEFAULT_BOTS;
        this._language = typeof language === 'string' ? language : 'en';
        this._key = `${this._language}.${this._name}.${this._domain}`;
        this._initFilters(filters);
        if (!this._initTransports(transports, transport)) {
            return;
        }
        this._initFormats(formats, format);
        this._initialized = true;
    }
    /**
     * Initializes filters.
     * @param {object[]} filters Filters to initialize
     * @private
     */
    _initFilters(filters) {
        if (filters instanceof Array) {
            this._filters = filters.map(f => new Filter(f));
        } else {
            this._filters = [new Filter()];
        }
    }
    /**
     * Initializes transports.
     * @param {object} transports Transports to initialize
     * @param {object} transport Single transport to initialize
     * @returns {boolean} Whether transports managed to initialize
     */
    _initTransports(transports, transport) {
        this._transports = {};
        if (typeof transports === 'object') {
            for (const i in transports) {
                this._transports[i] = this._initTransport(transports[i]);
            }
        } else if (typeof transport === 'object') {
            this._transports.default = this._initTransport(transport);
        } else {
            this._logger.error('No valid transports specified!');
            return false;
        }
        return true;
    }
    /**
     * Initializes a single transport.
     * @param {object} config Transport configuration
     * @returns {Transport?} Initialized transport on success
     * @private
     */
    _initTransport(config) {
        const c = typeof config === 'object' ? config : {};
        try {
            const OurTransport = require(`../../transports/${c.type || 'discord'}/main.js`);
            return new OurTransport(c);
        } catch (error) {
            this._logger.error('Error initializing transport', error);
        }
    }
    /**
     * Initializes formats.
     * @param {object} formats Formats to initialize
     * @param {object} format Single format to initialize
     * @private
     */
    _initFormats(formats, format) {
        this._formats = {};
        if (typeof formats === 'object') {
            for (const i in formats) {
                const c = formats[i];
                this._formats[i] = this._initFormat(
                    c,
                    this._transports[i] || this._transports.default
                );
            }
        } else if (typeof format === 'object') {
            this._formats.default = this._initFormat(
                format,
                this._transports.default
            );
        } else {
            this._formats.default = this._initFormat(
                {},
                this._transports.default
            );
        }
    }
    /**
     * Initializes a single format,
     * @param {object} config Format configuration
     * @param {Transport} transport Transport the format is for
     * @returns {Format?} Initialized format or nothing on failure
     * @private
     */
    _initFormat(config, transport) {
        const c = typeof config === 'object' ? config : {};
        if (typeof c.language !== 'string') {
            c.language = this._language;
        }
        try {
            const OurFormat = require(`../../formats/${c.type || 'logger'}/main.js`);
            return new OurFormat(c, transport);
        } catch (e) {
            this._logger.error('Error initializing format', e);
        }
    }
    /**
     * Sets data from MediaWiki API response.
     * @param {object} response MediaWiki API response
     * @param {object[]} response.variables Publicly available wiki variables
     * @param {object} response.general General wiki information
     * @param {object} response.namespaces Wiki namespace information
     */
    setData({variables, general, namespaces}) {
        this._id = Number(variables.filter(
            variable => variable.id === 'wgCityId'
        )[0]['*']);
        this._sitename = general.sitename;
        this._path = general.articlepath;
        this._namespaces = {};
        this._namespaceNames = {};
        this._canonicalNamespaces = {};
        for (const i in namespaces) {
            const ns = namespaces[i];
            const {id, canonical} = ns;
            const name = ns['*'];
            this._namespaces[name] = id;
            this._namespaces[canonical] = id;
            this._namespaceNames[id] = name;
            this._canonicalNamespaces[id] = canonical;
        }
    }
    /**
     * Gets namespace ID by its name.
     * @param {string} name Namespace name
     * @returns {number} Namespace ID
     */
    getNamespaceID(name) {
        return this._namespaces[name];
    }
    /**
     * Gets namespace local name by its ID.
     * @param {number} id Namespace ID
     * @returns {string} Namespace local name
     */
    getNamespace(id) {
        return this._namespaceNames[id];
    }
    /**
     * Gets namespace canonical name by its ID.
     * @param {number} id Namespace ID
     * @returns {string} Namespace canonical name
     */
    getCanonicalNamespace(id) {
        return this._canonicalNamespaces[id];
    }
    /**
     * Dispatches a message to the appropriate transport.
     * @param {Message} message Message to dispatch
     */
    async execute(message) {
        const result = this._filterMessage(message);
        if (!result) {
            return;
        }
        this._identifyNamespace(message);
        const format = this._formats[result] || this._formats.default;
        const transport = this._transports[result];
        if (!format) {
            this._logger.error(
                'Nonexistent format with no fallback',
                result,
                this._name
            );
            return;
        }
        if (!transport) {
            this._logger.error('Nonexistent transport', result, this._name);
            return;
        }
        const formatted = format.execute(message);
        if (formatted) {
            await transport.execute(formatted);
        }
    }
    /**
     * Passes a message through filters.
     * @param {Message} message Message to filter
     * @returns {string} Transport to use, if the message should be transported
     */
    _filterMessage(message) {
        if (this._bots.includes(message.user)) {
            return;
        }
        for (let i = 0, l = this._filters.length; i < l; ++i) {
            const filter = this._filters[i];
            const result = filter.execute(message);
            if (result) {
                return result;
            }
        }
    }
    /**
     * Identifies the namespace an event happened in.
     * @param {Message} message Message to identify
     */
    _identifyNamespace(message) {
        if (message.type === 'edit') {
            const index = message.page.indexOf(':');
            if (index === -1) {
                message.namespace = 0;
            } else {
                const namespace = message.page.substring(0, index);
                message.namespace = this.getNamespaceID(namespace) || 0;
            }
        }
    }
    /**
     * Cleans up the resources after a kill has been requested.
     */
    kill() {
        this._logger.close();
        for (const format in this._formats) {
            this._formats[format].kill();
        }
        for (const transport in this._transports) {
            this._transports[transport].kill();
        }
    }
    /**
     * Gets if the wiki's configuration was successfully initialized. If it was
     * not, it means there was an error in configuration, and such a wiki
     * should not be logged.
     * @returns {boolean} If the wiki's configuration was initialized
     */
    get initialized() {
        return this._initialized;
    }
    /**
     * Gets wiki's subdomain.
     * @returns {string} Wiki's subdomain
     */
    get name() {
        return this._name;
    }
    /**
     * Gets the wiki's domain.
     * @returns {string} Wiki's domain
     */
    get domain() {
        return this._domain;
    }
    /**
     * Gets the wiki's language.
     * @returns {string} Wiki's language
     */
    get language() {
        return this._language;
    }
    /**
     * Gets a unique identifier for a wiki.
     * @returns {string} Wiki language concatenated with wiki domain
     */
    get key() {
        return this._key;
    }
    /**
     * Gets the wiki's ID.
     * @returns {number} Wiki's ID
     */
    get id() {
        return this._id;
    }
    /**
     * Gets the wiki's name.
     * @returns {string} Wiki's name
     */
    get sitename() {
        return this._sitename;
    }
}

module.exports = Wiki;
