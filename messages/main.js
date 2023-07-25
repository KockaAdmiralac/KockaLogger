/**
 * messages.js
 *
 * Script for building message cache.
 */
'use strict';

const {resolve} = require('path');
const {writeFile} = require('fs/promises');
const messages = require('./messages.json');
const MAPPING = require('./map.js');
const IO = require('../include/io.js');
const util = require('../include/util.js');
const Logger = require('../include/log.js');

const DEFAULT_CACHE_DIRECTORY = 'cache';
const THREADS = 10;
const GENDER_PLACEHOLDER = 'GENDER PLACEHOLDER';
const MESSAGES = [
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
    'logentry-delete-event',
    'logentry-delete-revision',
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
     * @param {object} config KockaLogger configuration
     * @param {object} options Additional loader options
     * @param {string} options.cache Loader cache directory
     * @param {boolean} options.debug KockaLogger debug mode
     * @param {boolean} options.fetch If messages should be fetched beforehand
     */
    constructor(config, {cache, debug, fetch}) {
        this._debug = debug;
        this._doFetch = fetch;
        this._cacheDir = resolve(
            typeof cache === 'string' ?
                cache :
                DEFAULT_CACHE_DIRECTORY
        );
        this._caches = this._loadFile('_loader');
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
     * @param {string} key Key of the current property
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
     * @returns {object} All loaded messages as well as their processed versions
     */
    async run() {
        this._logger.info('KockaLogger started.');
        const shouldFetch = this._doFetch || !this._caches.messagecache;
        if (shouldFetch) {
            await this._fetch();
        }
        this._process();
        this._custom();
        if (shouldFetch) {
            this._logger.info('Saving caches...');
            await this._saveCache('', this._caches);
        }
        this._logger.info('Exiting loader...');
        for (const msg of MESSAGES) {
            this._caches.i18n[msg] = this._caches.i18n[msg]
                .map(m => (m instanceof RegExp ? m : new RegExp(m, 'u')));
        }
        for (const wiki in this._caches.i18n2) {
            const w = this._caches.i18n2[wiki];
            for (const msg in w) {
                if (!(w[msg] instanceof RegExp)) {
                    w[msg] = new RegExp(w[msg], 'u');
                }
            }
        }
        return this._caches;
    }
    /**
     * Loads a JSON file.
     * @param {string} file File to load
     * @returns {object?} Loaded file
     * @private
     */
    _loadFile(file) {
        try {
            return require(`${this._cacheDir}/${file}.json`);
        } catch (_) {
            // Ignoring error because cache loading errors are unimportant.
            return {};
        }
    }
    /**
     * Saves a file to cache.
     * @param {string} file File to save to cache
     * @param {object} object Object to save to cache
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
            this._caches.messagecache = {...this._results};
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
     * @param {string} lang Language code for which to fetch messages
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
     * @param {string} key System message key
     * @param {string} value System message contents
     * @returns {string} System message mapped to a regular expression
     * @private
     */
    _doMapping(key, value) {
        const placeholder = [];
        return MAPPING[key](value.replace(
            // This happens for some reason.
            /\{\{GENDER:[^|}]*\|?\}\}|/uig,
            ''
        ).replace(
            /\{\{GENDER:[^|]*\|([^}]+)\}\}/uig,
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
            new RegExp(GENDER_PLACEHOLDER, 'ug'),
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
     * @param {string} wiki Wiki to update the custom messages for
     * @param {string} language Language of the wiki
     * @param {string} domain Domain of the wiki
     * @param {object} data Custom messages for the wiki
     * @returns {object} Updated custom and generated messages
     */
    async updateCustom(wiki, language, domain, data) {
        if (!this._caches.custom) {
            this._caches.custom = {};
        }
        this._caches.custom[`${language}:${wiki}:${domain}`] = data;
        this._custom();
        try {
            await this._saveCache('', this._caches);
        } catch (error) {
            this._logger.error('Error while saving custom cache', error);
        }
        for (const w in this._caches.i18n2) {
            for (const msg in this._caches.i18n2[w]) {
                this._caches.i18n2[w][msg] =
                    new RegExp(this._caches.i18n2[w][msg], 'u');
            }
        }
        return {
            generated: this._caches.i18n2,
            messages: this._caches.custom
        };
    }
    /**
     * Disposes resources used by the message loader.
     */
    kill() {
        this._logger.close();
    }
}

module.exports = Loader;
