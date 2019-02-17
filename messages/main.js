/**
 * messages.js
 *
 * Script for building message cache.
 */
'use strict';

/**
 * Importing modules.
 */
const path = require('path'),
      fs = require('fs'),
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
        'logentry-delete-event-legacy',
        'logentry-delete-revision-legacy',
        'uploadedimage',
        'overwroteimage',
        '1movedto2',
        '1movedto2_redir',
        'blog-avatar-removed-log',
        'patrol-log-line',
        'chat-chatbanadd-log-entry',
        'chat-chatbanchange-log-entry',
        'chat-chatbanremove-log-entry',
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
    constructor(config, {cache, debug, fetch, generate}) {
        this._debug = debug;
        this._doFetch = fetch;
        this._generate = generate;
        this._cacheDir = path.resolve(
            typeof cache === 'string' ?
                cache :
                DEFAULT_CACHE_DIRECTORY
        );
        this._jobs = 0;
        this._caches = {
            custom: this._loadCache('custom'),
            i18n: this._loadCache('i18n'),
            i18n2: this._loadCache('i18n2'),
            messagecache: this._loadCache('messagecache')
        };
        this._io = new IO();
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
     * @param {Function} callback Callback function after loading finishes
     * @param {*} context Context to bind the callback to
     */
    run(callback, context) {
        this._logger = new Logger({
            file: true,
            name: 'loader',
            stdout: true
        });
        this._logger.info('KockaLogger started.');
        if (typeof callback === 'function') {
            this._callback = callback;
            this._context = context;
        }
        if (this._doFetch || !this._caches.messagecache) {
            ++this._jobs;
            this._fetch();
        } else if (this._generate || !this._caches.i18n) {
            ++this._jobs;
            this._process();
        }
        if (!this._caches.i18n2 && this._caches.custom) {
            ++this._jobs;
            this._custom();
        } else if (!this._caches.custom) {
            this._caches.i18n2 = {};
            this._caches.custom = {};
        }
        if (this._jobs === 0) {
            this._finished(true);
        }
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
        } catch (e) {
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
    _saveCache(file, object) {
        const filename = file ? `_loader_${file}` : '_loader';
        return new Promise(function(resolve, reject) {
            if (!object) {
                // Don't save if there's nothing to save.
                resolve();
                return;
            }
            fs.writeFile(
                `${this._cacheDir}/${filename}.json`,
                this._debug ?
                    JSON.stringify(object, this._replacer, '    ') :
                    JSON.stringify(object, this._replacer),
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        }.bind(this));
    }
    /**
     * Fetches required system messages for all languages.
     * @private
     */
    _fetch() {
        this._logger.info('Fetching required system messages...');
        this._results = {};
        messages.forEach(function(m) {
            this._results[m] = [];
        }, this);
        this._fetchLanguages().then(this._cbLanguages.bind(this)).catch(
            e => this._logger.error('Error while fetching languages', e)
        );
    }
    /**
     * Fetches all languages from the API.
     * @returns {Promise} Promise to listen on for response
     * @private
     */
    _fetchLanguages() {
        return this._io.query('community', 'en', 'fandom.com', {
            meta: 'siteinfo',
            siprop: 'languages'
        });
    }
    /**
     * Callback after fetching languages from the API.
     * @param {Object} data MediaWiki API response
     * @private
     */
    _cbLanguages(data) {
        this._languages = data.query.languages.map(l => l.code);
        this._running = THREADS;
        for (let i = 0; i < THREADS; ++i) {
            this._fetchMessages();
        }
    }
    /**
     * Fetches messages for a specific language.
     * @private
     */
    _fetchMessages() {
        const lang = this._languages.shift();
        if (!lang) {
            if (--this._running === 0) {
                delete this._results['patrol-log-diff'];
                this._caches.messagecache = Object.assign({}, this._results);
                this._process();
            }
            return;
        }
        this._logger.debug('Fetching messages for', lang);
        this._io.query('community', 'en', 'fandom.com', {
            amlang: lang,
            ammessages: messages.join('|'),
            amprop: 'default',
            meta: 'allmessages'
        }).then(this._cbMessages.bind(this))
        .catch(this._errMessages.bind(this));
    }
    /**
     * Callback after fetching messages.
     * @param {Object} data MediaWiki API response
     * @private
     */
    _cbMessages(data) {
        let diff = null;
        data.query.allmessages.forEach(function(m) {
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
        }, this);
        this._fetchMessages();
    }
    /**
     * Callback after fetching messages fails.
     * @param {Error} e Fetching error
     * @private
     */
    _errMessages(e) {
        this._logger.error('Error while fetching messages', e);
        // Continue anyways.
        this._fetchMessages();
    }
    /**
     * Processes i18n messages.
     * @private
     */
    _process() {
        this._logger.info('Processing messages...');
        this._caches.i18n = {};
        for (const i in this._caches.messagecache) {
            if (MAPPING[i]) {
                this._caches.i18n[i] = this._caches.messagecache[i]
                    .map(this._doMapping(i), this);
            } else {
                this._caches.i18n[i] = this._caches.messagecache[i];
            }
        }
        this._finish();
    }
    /**
     * Processes {{GENDER:}} magic words in system messages and maps
     * them using respective regular expressions.
     * @param {String} i Key of the mapping message
     * @returns {Function} Mapping function
     * @private
     */
    _doMapping(i) {
        return function(str) {
            const placeholder = [];
            return MAPPING[i](
                str.replace(/\{\{GENDER:[^|]*\|([^}]+)\}\}/ig, function(_, match) {
                    const arr = match.split('|');
                    if (arr[0] === arr[2] || arr[1] === arr[2]) {
                        arr.pop();
                    }
                    placeholder.push(`(?:${arr.map(util.escapeRegex).join('|')})`);
                    return GENDER_PLACEHOLDER;
                })
            ).replace(
                new RegExp(GENDER_PLACEHOLDER, 'g'),
                () => placeholder.shift()
            );
        };
    }
    /**
     * Processes custom messages.
     * @param {Boolean} noFinish If _finish shouldn't be called
     * @private
     */
    _custom(noFinish) {
        this._logger.info('Processing custom messages...');
        this._caches.i18n2 = {};
        for (const wiki in this._caches.custom) {
            if (!this._caches.i18n2[wiki]) {
                this._caches.i18n2[wiki] = {};
            }
            for (const msg in this._caches.custom[wiki]) {
                if (MAPPING[msg]) {
                    this._caches.i18n2[wiki][msg] = this._doMapping(msg)(
                        this._caches.custom[wiki][msg]
                    );
                }
            }
        }
        if (!noFinish) {
            this._finish();
        }
    }
    /**
     * Finishes a job.
     * @private
     */
    _finish() {
        if (--this._jobs === 0) {
            this._finished();
        }
    }
    /**
     * Callback after everything has finished.
     * @param {Boolean} noSave If caches should not be saved
     * @private
     */
    _finished(noSave) {
        if (noSave) {
            this._logger.info('Nothing to do, caches not saved.');
            this._finalize();
        } else {
            this._logger.info('Saving caches...');
            let promise = null;
            if (this._debug) {
                const promises = [];
                for (const cache in this._caches) {
                    promises.push(this._saveCache(cache, this._caches[cache]));
                }
                promise = Promise.all(promises);
            } else {
                promise = this._saveCache('', this._caches);
            }
            promise.then(this._finalize.bind(this)).catch(
                e => this._logger.error(
                    'An error occurred while saving cache',
                    e
                )
            );
        }
    }
    /**
     * Processes messages into RegExp objects and calls client callback.
     * @private
     */
    _finalize() {
        this._logger.info('Exiting loader...');
        MESSAGES.forEach(function(msg) {
            this._caches.i18n[msg] = this._caches.i18n[msg].map(function(m) {
                if (m instanceof RegExp) {
                    return m;
                }
                return new RegExp(m);
            });
        }, this);
        for (const wiki in this._caches.i18n2) {
            const w = this._caches.i18n2[wiki];
            for (const msg in w) {
                if (!(w[msg] instanceof RegExp)) {
                    w[msg] = new RegExp(w[msg]);
                }
            }
        }
        if (this._doFetch || this._generate) {
            this._logger.info('Nothing to do, exiting KockaLogger...');
            process.exit();
        } else if (this._callback) {
            this._callback.call(this._context, this._caches);
        }
    }
    /**
     * Updates custom messages and saves them to cache.
     * @param {String} wiki Wiki to update the custom messages for
     * @param {String} language Language of the wiki
     * @param {String} domain Domain of the wiki
     * @param {Object} data Custom messages for the wiki
     * @param {Function} callback Callback function after the update
     * @todo DRY?
     */
    updateCustom(wiki, language, domain, data, callback) {
        if (!this._caches.custom) {
            this._caches.custom = {};
        }
        this._caches.custom[`${language}:${wiki}:${domain}`] = data;
        this._custom(true);
        (
            this._debug ?
                Promise.all([
                    this._saveCache('custom', this._caches.custom),
                    this._saveCache('i18n2', this._caches.i18n2)
                ]) :
                this._saveCache('', this._caches)
        ).then(
            this._createUpdateCustomCallback(wiki, language, domain, callback)
        ).catch(e => this._logger.error('Error while saving custom cache', e));
    }
    /**
     * Callback after custom cache has been updated.
     * @param {String} wiki Wiki to update the custom messages for
     * @param {String} language Language of the wiki
     * @param {String} domain Domain of the wiki
     * @param {Function} callback Callback function after the update
     * @returns {Function} Generated callback function
     * @private
     */
    _createUpdateCustomCallback(wiki, language, domain, callback) {
        return function() {
            for (const w in this._caches.i18n2) {
                for (const msg in this._caches.i18n2[w]) {
                    this._caches.i18n2[w][msg] =
                        new RegExp(this._caches.i18n2[w][msg]);
                }
            }
            if (typeof callback === 'function') {
                callback(
                    wiki,
                    language,
                    domain,
                    this._caches.custom,
                    this._caches.i18n2
                );
            }
        }.bind(this);
    }
}

module.exports = Loader;
