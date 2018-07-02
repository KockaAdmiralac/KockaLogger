/**
 * main.js
 *
 * Logger format's main module
 */
'use strict';

/**
 * Importing modules
 */
const Format = require('../format.js'),
      util = require('../../include/util.js');

/**
 * Constants
 */
const ZWS = String.fromCharCode(8203);

/**
 * Logger format's class
 */
class Logger extends Format {
    /**
     * Class constructor
     * @param {Object} config Format configuration
     * @param {Transport} transport Transport used for the format
     */
    constructor(config, transport) {
        super(config, transport);
        this._i18n = require('./i18n/en.json');
        if (config.language && config.language !== 'en') {
            try {
                const i18n = require(`./i18n/${config.language}.json`);
                Object.assign(this._i18n, i18n);
            } catch (e) {
                console.log(e);
            }
        }
    }
    /**
     * Formats the RC message
     * @param {Message} message Message to format
     * @returns {Object} Formatted message
     */
    execute(message) {
        const func = this[`_handle${util.cap(message.type)}`];
        if (typeof func === 'function') {
            return func.call(this, message);
        }
        console.log('Cannot find handler for type', message.type);
        return null;
    }
    /**
     * Handles edits
     * @param {Message} m Message to format
     * @returns {Object} Formatted message
     * @private
     */
    _handleEdit(m) {
        const n = m.flags.includes('N');
        if (m.threadtitle) {
            return this._msg(
                `${
                    n ? 'new' : 'edit'
                }-${
                    m.isMain ? 'post' : 'reply'
                }`,
                m.wiki,
                m.user,
                m.threadid,
                m.threadtitle,
                m.ns,
                m.page.split(':')[1].split('/')[0],
                m.diff,
                n ? m.summary : m.params.diff
            );
        }
        if (n) {
            return this._msg(
                'new',
                m.wiki,
                m.user,
                m.page,
                m.diff,
                m.summary
            );
        }
        return this._msg(
            'edit',
            m.wiki,
            m.user,
            m.page,
            m.diff,
            m.params.diff,
            m.summary
        );
    }
    /* eslint-disable complexity */
    /**
     * Handles logs
     * @param {Message} m Message to format
     * @returns {Object} Formatted message
     * @private
     * @todo Split this up somehow
     */
    _handleLog(m) {
        const w = m.wiki;
        let temp = null, temp2 = null;
        switch (m.log) {
            case 'thread':
                temp = [
                    w,
                    m.user,
                    m.page,
                    m.page,
                    m.namespace,
                    m.page.split(':')[1].split('/')[0],
                    m.reason
                ];
                switch (m.action.substring(5)) {
                    case 'archive':
                        return this._msg('threadclose', ...temp);
                    case 'admindelete':
                        return this._msg('threaddelete', ...temp);
                    default:
                        return this._msg(
                            `thread${m.action.substring(5)}`,
                            ...temp
                        );
                }
            case 'block':
                switch (m.action) {
                    case 'block':
                    case 'reblock':
                        return this._msg(
                            m.action,
                            w,
                            m.user,
                            m.target,
                            m.expiry,
                            m.flags.join(', '),
                            m.reason
                        );
                    case 'unblock':
                        return this._msg(
                            'unblock',
                            w,
                            m.user,
                            m.target,
                            m.reason
                        );
                    default:
                        return '';
                }
            case 'newusers':
                return this._msg('newusers', w, m.user);
            case 'useravatar':
                switch (m.action) {
                    case 'avatar_chn':
                        return this._msg('avatar', w, m.user);
                    case 'avatar_rem':
                        return this._msg('remavatar', w, m.user, m.target);
                    default:
                        return '';
                }
            case 'delete':
                if (m.action === 'revision' || m.action === 'event') {
                    return this._msg(
                        m.action === 'revision' ? 'revdel' : 'logdel',
                        w,
                        m.user,
                        m.target,
                        m.reason
                    );
                }
                return this._msg(
                    m.action,
                    w,
                    m.user,
                    this._escape(m.page),
                    m.reason
                );
            case 'move':
                return this._msg(
                    m.action === 'move_redir' ? 'moveredir' : 'move',
                    w,
                    m.user,
                    this._escape(m.page),
                    m.target,
                    m.reason
                );
            case 'rights':
                temp = m.oldgroups.map(function(group) {
                    if (m.newgroups.includes(group)) {
                        return group;
                    }
                    return `**${group}**`;
                }).join(', ') || this._i18n['rights-none'];
                temp2 = m.newgroups.map(function(group) {
                    if (m.oldgroups.includes(group)) {
                        return group;
                    }
                    return `**${group}**`;
                }).join(', ') || this._i18n['rights-none'];
                return this._msg(
                    'rights',
                    w,
                    m.user,
                    m.target,
                    temp,
                    temp2,
                    m.reason
                );
            case 'upload':
                return this._msg(
                    m.action === 'overwrite' ? 'reupload' : 'upload',
                    w,
                    m.user,
                    `File:${m.file}`,
                    m.file,
                    m.reason
                );
            case 'chatban':
                if (m.action === 'chatbanremove') {
                    return this._msg(
                        'chatbanremove',
                        w,
                        m.user,
                        m.target,
                        m.reason
                    );
                }
                return this._msg(
                    m.action,
                    w,
                    m.user,
                    m.target,
                    this._escape(m.length),
                    m.reason
                );
            case 'protect':
                if (m.action === 'unprotect') {
                    return this._msg('unprotect', w, m.user, m.page, m.reason);
                } else if (m.action === 'move_prot') {
                    return this._msg(
                        'moveprotect',
                        w,
                        m.user,
                        m.page,
                        m.target,
                        m.reason
                    );
                }
                return this._msg(
                    m.action === 'modify' ? 'reprotect' : 'protect',
                    w,
                    m.user,
                    m.page,
                    m.level
                        .map(l => `[${l.feature}=${l.level}] (${l.expiry})`)
                        .join(' '),
                    m.reason
                );
            case 'abusefilter':
                return this._msg('abusefilter', w, m.user, m.id, m.diff);
            case 'wikifeatures':
                return this._msg(
                    'wikifeatures',
                    w,
                    m.user,
                    this._i18n[`feature-${m.value ? 'enable' : 'disable'}`],
                    this._i18n[`feature-${m.feature}`]
                );
            // patrol doesn't need to be logged
            default:
                return '';
        }
    }
    /* eslint-enable complexity */
    /**
     * Handles Discussions
     * @param {Message} m Message to format
     * @returns {Object} Formatted message
     * @private
     */
    _handleDiscussions(m) {
        return this._msg(
            'discussions',
            m.wiki,
            m.user,
            m.dtype === 'report' ?
                this._i18n['discussions-create-report'] :
                m.action === 'created' ?
                    this._i18n['discussions-create-post'] :
                    this._i18n[`discussions-${m.action}`],
            m.title,
            m.thread,
            m.reply,
            m.size,
            this._escape(m.category),
            m.snippet
        );
    }
    /* eslint-disable max-statements */
    /**
     * Formats an RC message by type
     * @param {String} key I18n message key
     * @param {String} wiki Wiki where the message occurred
     * @param {Array} args Arguments for the message
     * @returns {Object} Formatted message
     * @todo Nested templates support
     * @todo Split this up somehow
     */
    _msg(key, wiki, ...args) {
        const string = this._i18n[key];
        if (!string) {
            return {
                content: key ?
                    `Unknown message key: ${key}` :
                    'Undefined message key'
            };
        }
        let mode = 0,
            temp = 0,
            result = '';
        const templates = [],
              tArgs = [];
        for (let i = 0, l = string.length; i < l; ++i) {
            let char = string.charAt(i);
            if (mode === 1) {
                if (char >= '0' && char <= '9') {
                    temp = temp * 10 + Number(char);
                } else {
                    mode = 0;
                    if (temp > 0) {
                        const arg = args[temp - 1];
                        result += typeof arg === 'undefined' || arg === null ?
                            '' :
                            String(arg);
                        temp = 0;
                    } else {
                        result += '$';
                    }
                }
            } else if (mode === 2) {
                mode = 0;
                if (char === '{') {
                    templates.push(result);
                    result = '';
                    char = '';
                } else {
                    result += '{';
                }
            } else if (mode === 3) {
                mode = 0;
                if (char === '}') {
                    tArgs.push(result);
                    result = templates.pop() + this._template(
                        wiki,
                        ...tArgs.splice(0)
                    );
                    char = '';
                } else {
                    result += '}';
                }
            }
            if (mode === 0) {
                if (char === '$') {
                    mode = 1;
                } else if (char === '{') {
                    mode = 2;
                } else if (char === '}') {
                    mode = 3;
                } else if (char === '|' && templates.length) {
                    tArgs.push(result);
                    result = '';
                } else {
                    result += char;
                }
            }
        }
        return {
            content: result
        };
    }
    /* eslint-enable max-statements */
    /**
     * Escapes a message parameter
     * @param {String} param Parameter to escape
     * @returns {String} Escaped parameter
     */
    _escape(param) {
        return param
            // Escape links
            .replace(/http:\/\//g, `http:/${ZWS}/`)
            .replace(/https:\/\//g, `https:/${ZWS}/`)
            // Escape mentions
            .replace(/@/g, `@${ZWS}`)
            // Escape invite links
            .replace(/discord\.gg/g, `discord${ZWS}.${ZWS}gg`)
            // Escapes certain Markdown constructions
            .replace(/_{1,2}([^_*]+)_{1,2}/g, '$1')
            .replace(/\*{1,2}([^_*]+)\*{1,2}/g, '$1')
            .replace(/\r?\n|\r/g, '​');
    }
    /**
     * Makes a Markdown link
     * @param {String} text Text in the link
     * @param {String} wiki Wiki for the link
     * @param {String} url URL in the link
     * @returns {String} Markdown link
     */
    _link(text, wiki, url) {
        return `[${this._escape(text)}](<${util.url(wiki)}/${url.replace(/\)/g, '%29')}>)`;
    }
    /**
     * Makes a Markdown link to a wiki page
     * @param {String} text Text in the link
     * @param {String} wiki Wiki to link to
     * @param {String} page Page to link to
     * @returns {String} Markdown link
     * @todo Fix for new language paths
     */
    _wikiLink(text, wiki, page) {
        return this._link(text, wiki, `wiki/${util.encode(page)}`);
    }
    /**
     * Processes templates in i18n strings
     * @param {String} wiki Related wiki for linking
     * @param {String} type Template type
     * @param {Array<String>} args Template arguments
     * @returns {String} Processed template
     */
    _template(wiki, type, ...args) {
        let temp = null;
        switch (type) {
            case 'user':
                // Hack for autoblocks
                if (args[0].startsWith('#')) {
                    return this._escape(args[0]);
                }
                return `${
                    this._wikiLink(args[0], wiki, `User:${args[0]}`)
                } (${
                    this._wikiLink(
                        this._i18n.talk,
                        wiki,
                        `User talk:${args[0]}`
                    )
                }|${
                    this._wikiLink(
                        this._i18n.contribs,
                        wiki,
                        `Special:Contribs/${args[0]}`
                    )
                })`;
            case 'link':
                return this._wikiLink(args[1] || args[0], wiki, args[0]);
            case 'diff':
                return `(${this._link(this._i18n.diff, wiki, `?diff=${args[0]}`)})`;
            case 'diffSize':
                temp = '*'.repeat(args[0] > 500 || args[0] < -500 ? 2 : 1);
                if (args[0] > 0) {
                    args[0] = `+${args[0]}`;
                }
                return `${temp}(${args[0]})${temp}`;
            case 'summary':
                temp = args[0].trim();
                return temp.length === 0 ?
                    '' :
                    `(*${this._escape(temp.replace(/\n|\r/g, ''))}*)`;
            case 'board':
                return this._wikiLink(
                    this._msg(`board-${args[0]}`, wiki, args[1]).content,
                    wiki,
                    `${Number(args[0]) === 1201 ?
                        'Message Wall' :
                        'Board'}:${args[1]}`
                );
            case 'dlink':
                return this._link(
                    args[0] || this._i18n['discussions-reply'],
                    wiki,
                    `d/p/${args[2] ? `${args[1]}/r/${args[2]}` : args[1]}`
                );
            default:
                return '';
        }
    }
}

module.exports = Logger;
