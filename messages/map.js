/**
 * map.js
 *
 * Maps MediaWiki system messages to regular expressions later used during
 * IRC message parsing.
 */
'use strict';

const {escapeRegex} = require('../include/util.js');

const REASON = '\\s?(?::|：)\\s?(.*)';

/**
 * Function that marks the first wikitext link as colored
 * in a log entry
 * @param {string} e Log entry
 * @returns {string} Log entry with the first link IRC-colored
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
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    '1movedto2': e => `^${colorLink(escapeRegex(e))
        .replace('\\$1', '([^\x03]+)')
        .replace('\\$2', '([^\\]\x03]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the replacement autosummary
     * @param {string} e Replacement autosummary
     * @returns {string} Regex'd autosummary
     */
    'autosumm-replace': e => `^${escapeRegex(e)
        .replace('\\$1', '(.*)')
    }$`,
    /**
     * Transforms the block log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'blocklogentry': e => `^${colorLink(escapeRegex(e))
        .replace('\\$1', '[^:]+:([^\x03]+)')
        .replace('\\$2', '(.*)')
        .replace('\\$3', '(?:(?:\\(|（)([^\\)）]*)(?:\\)|）))?')
    }(?:${REASON})?$`,
    /**
     * Transforms the avatar log entry representing avatar removal
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'blog-avatar-removed-log': e => `^${escapeRegex(e)
        .replace('\\$1', '[^:]+:(.+)')
    }`,
    /**
     * Transforms the chat ban log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'chat-chatbanadd-log-entry': e => `^${colorLink(escapeRegex(e))
        .replace(
            '\\$1',
            '\\[\\[(?:\x0302)?[^:]+:([^\\]\x03]+)(?:\x0310)?\\]\\]'
        )
        .replace('\\$2', '([^:]*)')
        .replace('\\$3', '(.*)')
    }${REASON}$`,
    /**
     * Transforms the chat unban log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'chat-chatbanremove-log-entry': e => `^${colorLink(escapeRegex(e))
        .replace(
            '\\$1',
            '\\[\\[(?:\x0302)?[^:]+:([^\\]\x03]+)(?:\x0310)?\\]\\]'
        )
    }${REASON}$`,
    /**
     * Transforms the delete log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'deletedarticle': e => `^${escapeRegex(e).replace(
        /(?:\\\[\\\[)?\\\$1(?:\\\]\\\])?/u,
        '(?:\\[\\[)?(?:\x0302)?([^\x03\\]]+)(?:\x0310)?(?:\\]\\])?'
    )}(?:${REASON})?$`,
    /**
     * Transforms the log entry for revision deletion
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'logentry-delete-revision-legacy': e => `^${colorLink(escapeRegex(e))
        .replace('\\$1', '.+')
        .replace('\\$3', '\\[\\[\x0302([^\x03]+)\x0310\\]\\]')
    }(?:${REASON})?$`,
    /**
     * Transforms the log entry for moving protection
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'movedarticleprotection': e => `^${escapeRegex(e)
        .replace(
            '\\[\\[\\$1\\]\\]',
            '\\[\\[(?:\x0302)?([^\\]\x03]+)(?:\x0310)?\\]\\]'
        )
        .replace('\\$2', '([^\x03]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the patrol log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'patrol-log-line': e => `^${colorLink(escapeRegex(e))
        .replace('\\$1', '(\\d+)')
        .replace('\\$2', '\\[\\[(?:\x0302)?([^\\]\x03]+)(?:\x0310)?\\]\\]')
        .replace('\\$3', '')
    }$`,
    /**
     * Transforms the protect log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'protectedarticle': e => `^${colorLink(escapeRegex(e))
        .replace('\\$1', '([^\x03]+)')
        // eslint-disable-next-line max-len
        .replace('\\]\\]', '((?: ?(?:\\u200E|\\u200F)\\[(?:edit|move|upload|create|comment|everything)=\\w+\\] \\([^\\u200E\\u200F]+\\)){1,3})\\]\\]')
        // This is weird UCP behavior.
    }(?:${REASON})?$`,
    /**
     * Transforms the rights log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'rightslogentry': e => `^${escapeRegex(e)
        .replace('\\$1', '[^:]+:(.+)')
        .replace('\\$2', '([^:]+)')
        .replace('\\$3', '([^:]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the unblock log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'unblocklogentry': e => `^${escapeRegex(e)
        .replace('\\$1', '[^:]+:([^:]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the unprotect log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'unprotectedarticle': e => `^${colorLink(escapeRegex(e))
        .replace('\\$1', '([^\x03]+)')
    }(?:${REASON})?$`,
    /**
     * Transforms the delete log entry
     * @param {string} e Log entry
     * @returns {string} Regex'd log entry
     */
    'uploadedimage': e => `^${escapeRegex(e).replace(
        /(?:\\\[\\\[)?\\\$1(?:\\\]\\\])?/u,
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
MAPPING['logentry-delete-delete_redir'] =
MAPPING['logentry-delete-revision-legacy'];

module.exports = MAPPING;
