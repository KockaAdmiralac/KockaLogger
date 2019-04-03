/**
 * map.js
 *
 * Maps MediaWiki system messages to regular expressions later used during
 * IRC message parsing.
 */
'use strict';

/**
 * Importing modules
 */
const util = require('../include/util.js');

/**
 * Constants
 */
const REASON = '\\s?(?::|：)\\s?(.*)';

/**
 * Function that marks the first wikitext link as colored
 * in a log entry
 * @param {String} e Log entry
 * @returns {String} Log entry with the first link IRC-colored
 */
function colorLink(e) {
    return e.replace('\\[\\[', '\\[\\[(?:\x0302)?')
            .replace('\\]\\]', '(?:\x0310)?\\]\\]');
}

/**
 * Mapping functions for certain i18n messages
 */
const MAPPING = {
    /**
     * Transforms the move log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    '1movedto2': e => `^${colorLink(util.escapeRegex(e))
        .replace('\\$1', '([^\x03]+)')
        .replace('\\$2', '([^\\]\x03]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the replacement autosummary
     * @param {String} e Replacement autosummary
     * @returns {String} Regex'd autosummary
     */
    'autosumm-replace': e => `^${util.escapeRegex(e)
        .replace('\\$1', '(.*)')
    }$`,
    /**
     * Transforms the block log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'blocklogentry': e => `^${colorLink(util.escapeRegex(e))
        .replace('\\$1', '[^:]+:([^\x03]+)')
        .replace('\\$2', '(.*)')
        .replace('\\$3', '(?:\\(|（)([^\\)）]*)(?:\\)|）)')
    }(?:${REASON})?$`,
    /**
     * Transforms the avatar log entry representing avatar removal
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'blog-avatar-removed-log': e => `^${util.escapeRegex(e)
        .replace('\\$1', '[^:]+:(.+)')
    }`,
    /**
     * Transforms the chat ban log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'chat-chatbanadd-log-entry': e => `^${colorLink(util.escapeRegex(e))
        .replace(
            '\\$1',
            '\\[\\[(?:\x0302)?[^:]+:([^\\]\x03]+)(?:\x0310)?\\]\\]'
        )
        .replace('\\$2', '([^:]*)')
        .replace('\\$3', '(.*)')
    }${REASON}$`,
    /**
     * Transforms the chat unban log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'chat-chatbanremove-log-entry': e => `^${colorLink(util.escapeRegex(e))
        .replace(
            '\\$1',
            '\\[\\[(?:\x0302)?[^:]+:([^\\]\x03]+)(?:\x0310)?\\]\\]'
        )
    }${REASON}$`,
    /**
     * Transforms the delete log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'deletedarticle': e => `^${util.escapeRegex(e).replace(
        /(?:\\\[\\\[)?\\\$1(?:\\\]\\\])?/,
        '(?:\\[\\[)?(?:\x0302)?([^\x03\\]]+)(?:\x0310)?(?:\\]\\])?'
    )}(?:${REASON})?$`,
    /**
     * Transforms the log entry for revision deletion
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'logentry-delete-revision-legacy': e => `^${colorLink(util.escapeRegex(e))
        .replace('\\$1', '.+')
        .replace('\\$3', '\\[\\[\x0302([^\x03]+)\x0310\\]\\]')
    }(?:${REASON})?$`,
    /**
     * Transforms the log entry for moving protection
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'movedarticleprotection': e => `^${util.escapeRegex(e)
        .replace(
            '\\[\\[\\$1\\]\\]',
            '\\[\\[(?:\x0302)?([^\\]\x03]+)(?:\x0310)?\\]\\]'
        )
        .replace('\\$2', '([^\x03]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the patrol log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'patrol-log-line': e => `^${colorLink(util.escapeRegex(e))
        .replace('\\$1', '(\\d+)')
        .replace('\\$2', '\\[\\[(?:\x0302)?([^\\]\x03]+)(?:\x0310)?\\]\\]')
        .replace('\\$3', '')
    }$`,
    /**
     * Transforms the protect log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'protectedarticle': e => `^${colorLink(util.escapeRegex(e))
        .replace('\\$1', '([^\x03]+)')
    }((?: (?:\\u200E|\\u200F)\\[(?:edit|move|upload|create|everything)=\\w+\\] \\([^\\u200E\\u200F)]+\\)){1,3})(?:${REASON})?$`,
    /**
     * Transforms the rights log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'rightslogentry': e => `^${util.escapeRegex(e)
        .replace('\\$1', '[^:]+:(.+)')
        .replace('\\$2', '([^:]+)')
        .replace('\\$3', '([^:]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the unblock log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'unblocklogentry': e => `^${util.escapeRegex(e)
        .replace('\\$1', '[^:]+:(.+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the unprotect log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'unprotectedarticle': e => `^${colorLink(util.escapeRegex(e))
        .replace('\\$1', '([^\x03]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the delete log entry
     * @param {String} e Log entry
     * @returns {String} Regex'd log entry
     */
    'uploadedimage': e => `^${util.escapeRegex(e).replace(
        /(?:\\\[\\\[)?\\\$1(?:\\\]\\\])?/,
        '(?:\\[\\[)?(?:\x0302)?[^:]+:([^\\]\x03]+)(?:\x0310)?(?:\\]\\])?'
    )}(?:${REASON})?$`
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
