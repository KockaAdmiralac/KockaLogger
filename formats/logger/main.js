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
        const w = message.wiki;
        if (message.type === 'edit') {
            if (message.flags.includes('N')) {
                return this._msg(
                    'new',
                    w,
                    message.user,
                    message.page,
                    message.diff,
                    message.summary
                );
            }
            return this._msg(
                'edit',
                w,
                message.user,
                message.page,
                message.diff,
                message.params.diff,
                message.summary
            );
        } else if (message.type === 'log') {
            return this._handleLog(message);
        } else if (message.type === 'discussions') {
            return this._msg(
                'discussions',
                w,
                message.user,
                message.dtype === 'report' ?
                    this._i18n['discussions-create-report'] :
                    message.action === 'created' ?
                        this._i18n['discussions-create-post'] :
                        this._i18n[`discussions-${message.action}`],
                message.title,
                message.thread,
                message.reply,
                message.size,
                this._escape(message.category),
                message.snippet
            );
        }
        return null;
    }
    /* eslint-disable complexity */
    /**
     * Handles logs
     * @param {Message} m Message to format
     * @returns {Object} Formatted message
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
                    m.feature,
                    m.value
                );
            // patrol doesn't need to be logged
            default:
                return '';
        }
    }
    /* eslint-enable complexity */
    /**
     * Formats an RC message by type
     * @param {String} key I18n message key
     * @param {String} wiki Wiki where the message occurred
     * @param {Array} args Arguments for the message
     * @returns {Object} Formatted message
     */
    _msg(key, wiki, ...args) {
        const params = args.map(this._preprocess, this);
        return {
            content: this._i18n[key].replace(
                /\$(\d+)/g,
                (_, index) => params[Number(index) - 1]
            ).replace(
                /\{\{([^}]+)\}\}/g,
                (_, template) => this._template(wiki, ...template.split('|'))
            )
        };
    }
    /**
     * Preprocesses parameters so they can be successfully
     * replaced into the i18n string
     * @param {String} param Parameter to preprocess
     * @returns {String} Preprocessed parameter
     */
    _preprocess(param) {
        return String(param || '')
            .replace(/\{\{/g, `{${ZWS}{`)
            .replace(/\}\}/g, `}${ZWS}}`)
            .replace(/\|/g, `${ZWS}I`);
    }
    /**
     * Unescapes certain constructions that aren't
     * hazardous anymore
     * @param {String} message Message to postprocess
     * @returns {String} Unescaped message
     */
    _postprocess(message) {
        return message
            .replace(/\{\u200B\{/g, '{{')
            .replace(/\}\u200B\}/g, '}}')
            .replace(/\u200BI/g, '|');
    }
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
                    `${args[0] === 1201 ?
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
