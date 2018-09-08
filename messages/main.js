/**
 * messages.js
 *
 * Script for building message cache
 */
'use strict';

/**
 * Importing modules
 */
const http = require('request-promise-native'),
      fs = require('fs'),
      messages = require('./messages.json'),
      custom = require('./custom.json'),
      MAPPING = require('./map.js'),
      util = require('../include/util.js');

/**
 * Constants
 */
const results = {},
      THREADS = 10,
      debug = process.argv.includes('--debug'),
      GENDER_PLACEHOLDER = 'GENDER PLACEHOLDER';

/**
 * Preprocessing
 */
let languages = [],
    running = THREADS,
    ended = 0;
messages.forEach(function(m) {
    results[m] = [];
});

/**
 * Formats JSON depending on if it's in debug mode or not
 * @param {Object} json JSON object to format
 * @returns {String} Beautified JSON if in debug mode, normal if not
 */
function formatJSON(json) {
    if (debug) {
        return JSON.stringify(json, null, '    ');
    }
    return JSON.stringify(json);
}

/**
 * Callback after writing to the file
 */
function finished() {
    if (++ended === 2) {
        console.log('Finished!');
    }
}

/**
 * Processes {{GENDER:}} magic words in system messages and maps
 * them using respective regular expressions
 * @param {String} i Key of the mapping message
 * @returns {Function} Mapping function
 */
function doMapping(i) {
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
 * Post-processes message fetching results
 * @param {Object} res Message fetching results
 */
function postProcess(res) {
    console.log('Processing messages...');
    for (const i in res) {
        if (MAPPING[i]) {
            res[i] = res[i].map(doMapping(i));
        }
    }
    fs.writeFile('messages/i18n.json', formatJSON(res), finished);
}

/**
 * Callback after cache has been written
 */
function afterCache() {
    if (process.argv.includes('--no-process')) {
        finished();
    } else {
        postProcess(results);
    }
}

/**
 * Calls the MediaWiki API to find all required messages in one language
 */
function apiCall() {
    const lang = languages.shift();
    if (!lang) {
        if (--running === 0) {
            console.log('Writing to cache...');
            delete results['patrol-log-diff'];
            fs.writeFile(
                'messages/messagecache.json',
                formatJSON(results),
                afterCache
            );
        }
        return;
    }
    console.log(`Fetching messages for ${lang}...`);
    http({
        headers: {
            'User-Agent': 'The time has come.'
        },
        json: true,
        method: 'GET',
        qs: {
            action: 'query',
            amlang: lang,
            ammessages: messages.join('|'),
            amprop: 'default',
            format: 'json',
            meta: 'allmessages'
        },
        uri: 'https://community.wikia.com/api.php'
    }).then(function(d) {
        let diff = null;
        d.query.allmessages.forEach(function(m) {
            const text = m.default || m['*'];
            if (m.name === 'patrol-log-diff') {
                diff = text;
            } else if (diff && m.name === 'patrol-log-line') {
                const diffText = text.replace('$1', diff);
                if (!results['patrol-log-line'].includes(diffText)) {
                    results['patrol-log-line'].push(diffText);
                }
            } else if (!results[m.name].includes(text)) {
                results[m.name].push(text);
            }
        });
        apiCall();
    });
}

/**
 * Processes custom messages
 */
function processCustom() {
    for (const wiki in custom) {
        for (const msg in custom[wiki]) {
            custom[wiki][msg] = doMapping(msg)(custom[wiki][msg]);
        }
    }
    fs.writeFile('messages/i18n2.json', formatJSON(custom), finished);
}

/**
 * Start process
 */
if (process.argv.includes('--cache')) {
    // Load messages from cache
    console.log('Loading messages from cache...');
    let cache = null;
    try {
        cache = require('./messagecache.json');
    } catch (e) {
        console.log(
            'An error occurred while loading message cache:',
            e.message
        );
    }
    if (cache) {
        postProcess(cache);
    }
} else {
    // Fetch messages from API
    console.log('Fetching languages...');
    http({
        headers: {
            'User-Agent': 'The time has come.'
        },
        json: true,
        method: 'GET',
        qs: {
            action: 'query',
            format: 'json',
            meta: 'siteinfo',
            siprop: 'languages'
        },
        uri: 'https://community.wikia.com/api.php'
    }).then(function(d) {
        languages = d.query.languages.map(l => l.code);
        for (let i = 0; i < THREADS; ++i) {
            apiCall();
        }
    });
}
processCustom();
