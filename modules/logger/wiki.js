/**
 * wiki.js
 *
 * Module for wiki data handling.
 */
'use strict';

/**
 * Importing modules.
 */
const Logger = require('../../include/log.js'),
      Filter = require('./filter.js');

/**
 * Constants.
 */
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
     * @param {Object} config Wiki configuration
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
        this._name = config.wiki;
        this._domain = config.domain || 'fandom.com';
        this._bots = config.bots instanceof Array ?
            config.bots :
            DEFAULT_BOTS;
        this._language = typeof config.language === 'string' ?
            config.language :
            'en';
        this._key = `${this._language}.${this._name}.${this._domain}`;
        this._initFilters(config.filters);
        if (!this._initTransports(config.transports, config.transport)) {
            return;
        }
        this._initFormats(config.formats, config.format);
        this._initialized = true;
    }
    /**
     * Initializes filters.
     * @param {Array<Object>} filters Filters to initialize
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
     * @param {Object} transports Transports to initialize
     * @param {Object} transport Single transport to initialize
     * @returns {Boolean} Whether transports managed to initialize
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
     * @param {Object} config Transport configuration
     * @returns {Transport|undefined} Initialized transport on success
     * @private
     */
    _initTransport(config) {
        const c = typeof config === 'object' ? config : {};
        try {
            const Transport = require(`../../transports/${c.type || 'discord'}/main.js`);
            return new Transport(c);
        } catch (e) {
            this._logger.error('Error initializing transport', e);
        }
    }
    /**
     * Initializes formats.
     * @param {Object} formats Formats to initialize
     * @param {Object} format Single format to initialize
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
     * @param {Object} config Format configuration
     * @param {Transport} transport Transport the format is for
     * @returns {Format|undefined} Initialized format or nothing on failure
     * @private
     */
    _initFormat(config, transport) {
        const c = typeof config === 'object' ? config : {};
        if (typeof c.language !== 'string') {
            c.language = this._language;
        }
        try {
            const Format = require(`../../formats/${c.type || 'logger'}/main.js`);
            return new Format(c, transport);
        } catch (e) {
            this._logger.error('Error initializing format', e);
        }
    }
    /**
     * Sets data from MediaWiki API response,
     * @param {Object} data MediaWiki API response
     * @todo Use the statistics somehow
     */
    setData(data) {
        this._id = Number(data.variables.filter((variable) => variable.id === 'wgCityId')[0]['*']);
        this._sitename = data.general.sitename;
        this._path = data.general.articlepath;
        this._namespaces = {};
        this._namespaceNames = {};
        this._canonicalNamespaces = {};
        for (const i in data.namespaces) {
            const ns = data.namespaces[i],
                  {id} = ns,
                  name = ns['*'],
                  canon = ns.canonical;
            this._namespaces[name] = id;
            this._namespaces[canon] = id;
            this._namespaceNames[id] = name;
            this._canonicalNamespaces[id] = canon;
        }
        this._statistics = data.statistics;
    }
    /**
     * Gets namespace ID by its name.
     * @param {String} name Namespace name
     * @returns {Number} Namespace ID
     */
    getNamespaceID(name) {
        return this._namespaces[name];
    }
    /**
     * Gets namespace local name by its ID.
     * @param {Number} id Namespace ID
     * @returns {String} Namespace local name
     */
    getNamespace(id) {
        return this._namespaceNames[id];
    }
    /**
     * Gets namespace canonical name by its ID.
     * @param {Number} id Namespace ID
     * @returns {String} Namespace canonical name
     */
    getCanonicalNamespace(id) {
        return this._canonicalNamespaces[id];
    }
    /**
     * Dispatches a message to the appropriate transport.
     * @param {Message} message Message to dispatch
     */
    execute(message) {
        const result = this._filterMessage(message);
        if (!result) {
            return;
        }
        this._identifyNamespace(message);
        const format = this._formats[result] || this._formats.default,
              transport = this._transports[result];
        if (!format) {
            this._logger.error(
                'Nonexistent format with no fallback',
                result, this._name
            );
            return;
        }
        if (!transport) {
            this._logger.error('Nonexistent transport', result, this._name);
        }
        const formatted = format.execute(message);
        if (formatted) {
            transport.execute(formatted);
        }
    }
    /**
     * Passes a message through filters.
     * @param {Message} message Message to filter
     * @returns {String} Transport to use, if the message should be transported
     */
    _filterMessage(message) {
        if (this._bots.includes(message.user)) {
            return;
        }
        for (let i = 0, l = this._filters.length; i < l; ++i) {
            const filter = this._filters[i],
                  result = filter.execute(message);
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
     * @param {Function} callback Callback to call after cleaning up
     */
    kill(callback) {
        this._logger.close(callback);
    }
    /**
     * Gets if the wiki's configuration was initialized.
     * @returns {Boolean} If the wiki's configuration was initialized
     */
    get initialized() {
        return this._initialized;
    }
    /**
     * Gets wiki's subdomain.
     * @returns {String} Wiki's subdomain
     */
    get name() {
        return this._name;
    }
    /**
     * Gets the wiki's domain.
     * @returns {String} Wiki's domain
     */
    get domain() {
        return this._domain;
    }
    /**
     * Gets a unique identifier for a wiki.
     * @returns {String} Wiki language concatenated with wiki domain
     */
    get key() {
        return this._key;
    }
    /**
     * Gets the wiki's ID.
     * @returns {Number} Wiki's ID
     */
    get id() {
        return this._id;
    }
    /**
     * Gets the wiki's name.
     * @returns {String} Wiki's name
     */
    get sitename() {
        return this._sitename;
    }
}

module.exports = Wiki;
