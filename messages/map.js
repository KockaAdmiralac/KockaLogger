/**
 * map.js
 *
 * @todo Kill me now
 */
'use strict';

/**
 * Importing modules
 */
const util = require('../include/util.js');

/**
 * Function that marks the first wikitext link as colored
 * in a log entry
 * @param {String} e Log entry
 * @returns {String} Log entry with the first link IRC-colored
 */
function colorLink(e) {
    return e.replace('[[', '[[\u000302')
            .replace(']]', '\u000310]]');
}

/**
 * Mapping functions for certain i18n messages
 */
const MAPPING = {
    '1movedto2': e => `^${util.escapeRegex(colorLink(e))
        .replace('\\$1', '([^\u0003]+)')
        .replace('\\$2', '([^\\]]+)')
    }(?:: (.*))?$`,
    /**
     * Transforms the block log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'blocklogentry': e => `^${util.escapeRegex(colorLink(e))
        .replace('\\$1', '[^:]+:([^\u0003]+)')
        .replace('\\$2', '(.*)')
        .replace('\\$3', '(?:\\(|（)([^\\)）]*)(?:\\)|）)')
    }(?:: (.*))?$`,
    /**
     * Transforms the chat ban log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'chat-chatbanadd-log-entry': e => `^${util.escapeRegex(colorLink(e))
        .replace('\\$1', '\\[\\[\u000302[^:]+:([^\u0003]+)\u000310\\]\\]')
        .replace('\\$2', '([^:]+)')
        .replace('\\$3', '(.*)')
    }: (.*)$`,
    /**
     * Transforms the chat unban log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'chat-chatbanremove-log-entry': e => `^${util.escapeRegex(colorLink(e))
        .replace('\\$1', '\\[\\[\u000302[^:]+:([^\u0003]+)\u000310\\]\\]')
    }: (.*)$`,
    /**
     * Transforms the delete log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'deletedarticle': e => `^${util.escapeRegex(e).replace(
        '\\[\\[\\$1\\]\\]',
        '\\[\\[(?:\u000302)?([^\u0003\\]]+)(?:\u000310)?\\]\\]'
    )}(?:: (.*))?$`,
    /**
     * Transforms the log entry for revision deletion
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'logentry-delete-revision-legacy': e => `^${util.escapeRegex(colorLink(e))
        .replace('\\$1', '.+')
        .replace('\\$3', '\\[\\[\u000302([^\u0003]+)\u000310\\]\\]')
    }(?:: (.*))?$`,
    /**
     * Transforms the log entry for moving protection
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'movedarticleprotection': e => `^${util.escapeRegex(e)
        .replace('\\[\\[\\$1\\]\\]', '\\[\\[\u000302([^\u0003]+)\u000310\\]\\]')
        .replace('\\$2', '([^\u0003]+)')
    }(?:: (.*))?$`,
    /**
     * Transforms the patrol log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'patrol-log-line': e => `^${util.escapeRegex(colorLink(e))
        .replace('\\$1', '(\\d+)')
        .replace('\\$2', '\\[\\[\u000302([^\u0003]+)\u000310\\]\\]')
        .replace('\\$3', '')
    }$`,
    /**
     * Transforms the protect log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'protectedarticle': e => `^${util.escapeRegex(colorLink(e))
        .replace('\\$1', '([^\u0003]+)')
    }((?: \u200E\\[(?:edit|move|upload|create)=(?:loggedin|autoconfirmed|sysop)\\] \\([^\u200E]+\\)){1,3})(?:: (.*))?$`,
    /**
     * Transforms the rights log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'rightslogentry': e => `^${util.escapeRegex(e)
        .replace('\\$1', '[^:]+:([^:]+)')
        .replace('\\$2', '([^:]+)')
        .replace('\\$3', '([^:]+)')
    }(?:: (.*))?$`,
    /**
     * Transforms the unblock log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     * @todo Edge case: User has : in username
     */
    'unblocklogentry': e => `^${util.escapeRegex(e)
        .replace('\\$1', '[^:]+:([^:]+)')
    }(?:: (.*))?$`,
    /**
     * Transforms the unprotect log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'unprotectedarticle': e => `^${util.escapeRegex(colorLink(e))
        .replace('\\$1', '([^\u0003]+)')
    }(?:: (.*))?$`,
    /**
     * Transforms the delete log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'uploadedimage': e => `^${util.escapeRegex(e).replace(
        '\\[\\[\\$1\\]\\]',
        '\\[\\[\u000302[^:]+:([^\u0003]+)\u000310\\]\\]'
    )}(?:: (.*))?$`
};
MAPPING['reblock-logentry'] = MAPPING.blocklogentry;
MAPPING.modifiedarticleprotection = MAPPING.protectedarticle;
MAPPING.undeletedarticle = MAPPING.deletedarticle;
MAPPING.overwroteimage = MAPPING.uploadedimage;
MAPPING['1movedto2_redir'] = MAPPING['1movedto2'];
MAPPING['chat-chatbanchange-log-entry'] =
MAPPING['chat-chatbanadd-log-entry'];
MAPPING['logentry-delete-event-legacy'] =
MAPPING['logentry-delete-revision-legacy'];

module.exports = MAPPING;
