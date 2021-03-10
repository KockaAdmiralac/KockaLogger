/**
 * messages.js
 *
 * Script for building message cache.
 */
'use strict';

/**
 * Importing modules.
 */
const {resolve} = require('path'),
      {writeFile} = require('fs/promises'),
      messages = require('./messages.json'),
      MAPPING = require('./map.js'),
      IO = require('../include/io.js'),
      util = require('../include/util.js'),
      Logger = require('../include/log.js');

/**
 * Constants.
 */
const DEFAULT_CACHE_DIRECTORY = 'cache',
      THREADS = 10,
      GENDER_PLACEHOLDER = 'GENDER PLACEHOLDER',
      MESSAGES = [
        'blocklogentry',
        'unblocklogentry',
        'reblock-logentry',
        'protectedarticle',
        'modifiedarticleprotection',
        'unprotectedarticle',
        'movedarticleprotection',
        'rightslogentry',
        'deletedarticle',
        'undeletedarticle',
        'logentry-delete-delete_redir',
        'logentry-delete-event-legacy',
        'logentry-delete-revision-legacy',
        'uploadedimage',
        'overwroteimage',
        '1movedto2',
        '1movedto2_redir',
        'patrol-log-line',
        'autosumm-replace'
    ];

/**
 * Message loader and processor class
 */
class Loader {
    /**
     * Class constructor.
     * @param {Object} config KockaLogger configuration
     * @param {String} cache Loader cache directory
     * @param {Boolean} debug KockaLogger debug mode
     * @param {Boolean} fetch If messages should be fetched beforehand
     * @param {Boolean} generate If messages should only be generated
     */
    constructor(config, {cache, debug, fetch}) {
        this._debug = debug;
        this._doFetch = fetch;
        this._cacheDir = resolve(
            typeof cache === 'string' ?
                cache :
                DEFAULT_CACHE_DIRECTORY
        );
        this._caches = {
            custom: this._loadCache('custom'),
            i18n: this._loadCache('i18n'),
            i18n2: this._loadCache('i18n2'),
            messagecache: this._loadCache('messagecache')
        };
        this._io = new IO();
        this._logger = new Logger({
            file: true,
            name: 'loader',
            stdout: true
        });
    }
    /**
     * Serializes RegExp objects into plain strings.
     * Used as a replacer function for JSON.stringify.
     * @param {String} key Key of the current property
     * @param {*} value Value of the current property
     * @returns {*} Serialized RegExp or original value
     */
    _replacer(key, value) {
        if (value instanceof RegExp) {
            return value.toString().slice(1, -1);
        }
        return value;
    }
    /**
     * Runs the loading.
     */
    async run() {
        this._logger.info('KockaLogger started.');
        if (this._doFetch || !this._caches.messagecache) {
            await this._fetch();
        }
        this._process();
        this._custom();
        if (this._doFetch || !this._caches.messagecache) {
            this._logger.info('Saving caches...');
            if (this._debug) {
                for (const cache in this._caches) {
                    await this._saveCache(cache, this._caches[cache]);
                }
            } else {
                await this._saveCache('', this._caches);
            }
        }
        this._logger.info('Exiting loader...');
        for (const msg of MESSAGES) {
            this._caches.i18n[msg] = this._caches.i18n[msg]
                .map(m => (m instanceof RegExp ? m : new RegExp(m)));
        }
        for (const wiki in this._caches.i18n2) {
            const w = this._caches.i18n2[wiki];
            for (const msg in w) {
                if (!(w[msg] instanceof RegExp)) {
                    w[msg] = new RegExp(w[msg]);
                }
            }
        }
        return this._caches;
    }
    /**
     * Loads a JSON file.
     * @param {String} file File to load
     * @returns {Object|undefined} Loaded file
     * @private
     */
    _loadFile(file) {
        try {
            return require(`${this._cacheDir}/${file}.json`);
        } catch (_) {
            // Ignoring error because cache loading errors are unimportant.
            return undefined;
        }
    }
    /**
     * Loads a file from cache.
     * @param {String} file File to load
     * @returns {Object|undefined} Loaded file
     * @private
     */
    _loadCache(file) {
        if (this._debug) {
            return this._loadFile(`_loader_${file}`);
        } else if (this._cache) {
            return this._cache[file];
        }
        this._cache = this._loadFile('_loader');
        if (!this._cache) {
            this._cache = {};
        }
        return this._cache[file];
    }
    /**
     * Saves a file to cache.
     * @param {String} file File to save to cache
     * @param {Object} object Object to save to cache
     * @returns {Promise} Promise for file saving
     * @private
     */
    async _saveCache(file, object) {
        const filename = file ? `_loader_${file}` : '_loader';
        if (!object) {
            // Don't save if there's nothing to save.
            return;
        }
        await writeFile(
            `${this._cacheDir}/${filename}.json`,
            this._debug ?
                JSON.stringify(object, this._replacer, '    ') :
                JSON.stringify(object, this._replacer)
        );
    }
    /**
     * Fetches required system messages for all languages.
     * @private
     */
    async _fetch() {
        this._logger.info('Fetching required system messages...');
        this._results = {};
        for (const msg of messages) {
            this._results[msg] = [];
        }
        try {
            const languages = await this._fetchLanguages();
            while (languages.length > 0) {
                await Promise.all(
                    languages
                        .splice(0, THREADS)
                        .map(lang => this._fetchMessages(lang))
                );
            }
            delete this._results['patrol-log-diff'];
            this._caches.messagecache = Object.assign({}, this._results);
        } catch (error) {
            this._logger.error('Error while fetching', error);
        }
    }
    /**
     * Fetches all languages from the API.
     * @returns {Promise} Promise to listen on for response
     * @private
     */
    async _fetchLanguages() {
        return (await this._io.query('community', 'en', 'fandom.com', {
            meta: 'siteinfo',
            siprop: 'languages'
        })).query.languages.map(l => l.code);
    }
    /**
     * Fetches messages for a specific language.
     * @param {String} lang Language code for which to fetch messages
     * @private
     */
    async _fetchMessages(lang) {
        this._logger.debug('Fetching messages for', lang);
        const {query} = await this._io.query('community', 'en', 'fandom.com', {
            amlang: lang,
            ammessages: messages.join('|'),
            amprop: 'default',
            meta: 'allmessages'
        });
        let diff = null;
        for (const m of query.allmessages) {
            const text = m.default || m['*'];
            if (m.name === 'patrol-log-diff') {
                diff = text;
            } else if (diff && m.name === 'patrol-log-line') {
                const diffText = text.replace('$1', diff);
                if (!this._results['patrol-log-line'].includes(diffText)) {
                    this._results['patrol-log-line'].push(diffText);
                }
            } else if (!this._results[m.name].includes(text)) {
                this._results[m.name].push(text);
            }
        }
    }
    /**
     * Processes i18n messages.
     * @private
     */
    _process() {
        this._logger.info('Processing messages...');
        this._caches.i18n = {};
        for (const key in this._caches.messagecache) {
            if (MAPPING[key]) {
                this._caches.i18n[key] = this._caches.messagecache[key]
                    .map(this._doMapping.bind(this, key), this);
            } else {
                this._caches.i18n[key] = this._caches.messagecache[key];
            }
        }
    }
    /**
     * Processes {{GENDER:}} magic words in system messages and maps
     * them using respective regular expressions.
     * @param {String} key System message key
     * @param {String} value System message contents
     * @returns {String} System message mapped to a regular expression
     * @private
     */
    _doMapping(key, value) {
        const placeholder = [];
        return MAPPING[key](value.replace(
            /\{\{GENDER:[^|]*\|([^}]+)\}\}/ig,
            function(_, match) {
                const arr = match.split('|');
                if (
                    arr.length > 1 &&
                    (arr[0] === arr[2] || arr[1] === arr[2])
                ) {
                    arr.pop();
                }
                placeholder.push(`(?:${arr.map(util.escapeRegex).join('|')})`);
                return GENDER_PLACEHOLDER;
            }
        )).replace(
            new RegExp(GENDER_PLACEHOLDER, 'g'),
            () => placeholder.shift()
        );
    }
    /**
     * Processes custom messages.
     * @private
     */
    _custom() {
        this._logger.info('Processing custom messages...');
        this._caches.i18n2 = {};
        for (const wiki in this._caches.custom) {
            if (!this._caches.i18n2[wiki]) {
                this._caches.i18n2[wiki] = {};
            }
            for (const msg in this._caches.custom[wiki]) {
                if (MAPPING[msg]) {
                    this._caches.i18n2[wiki][msg] = this._doMapping(
                        msg,
                        this._caches.custom[wiki][msg]
                    );
                }
            }
        }
    }
    /**
     * Updates custom messages and saves them to cache.
     * @param {String} wiki Wiki to update the custom messages for
     * @param {String} language Language of the wiki
     * @param {String} domain Domain of the wiki
     * @param {Object} data Custom messages for the wiki
     */
    async updateCustom(wiki, language, domain, data) {
        if (!this._caches.custom) {
            this._caches.custom = {};
        }
        this._caches.custom[`${language}:${wiki}:${domain}`] = data;
        this._custom();
        try {
            if (this._debug) {
                await this._saveCache('custom', this._caches.custom);
                await this._saveCache('i18n2', this._caches.i18n2);
            } else {
                await this._saveCache('', this._caches);
            }
        } catch (error) {
            this._logger.error('Error while saving custom cache', error);
        }
        for (const w in this._caches.i18n2) {
            for (const msg in this._caches.i18n2[w]) {
                this._caches.i18n2[w][msg] =
                    new RegExp(this._caches.i18n2[w][msg]);
            }
        }
        return {
            generated: this._caches.i18n2,
            messages: this._caches.custom
        };
    }
    /**
     * Disposes resources used by the message loader.
     * @todo Remove callback
     */
    kill() {
        this._logger.close();
    }
}

module.exports = Loader;
