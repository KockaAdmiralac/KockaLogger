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
      MAPPING = require('./map.js');

/**
 * Constants
 */
const results = {},
      THREADS = 10,
      debug = process.argv.includes('--debug');

/**
 * Preprocessing
 */
let languages = [], running = THREADS;
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
    console.log('Finished!');
}

/**
 * Post-processes message fetching results
 * @param {Object} res Message fetching results
 */
function postProcess(res) {
    console.log('Processing messages...');
    for (const i in res) {
        if (MAPPING[i]) {
            res[i] = res[i].map(MAPPING[i]);
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
        uri: 'http://community.wikia.com/api.php'
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
        uri: 'http://community.wikia.com/api.php'
    }).then(function(d) {
        languages = d.query.languages.map(l => l.code);
        for (let i = 0; i < THREADS; ++i) {
            apiCall();
        }
    });
}
