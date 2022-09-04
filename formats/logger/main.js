/**
 * main.js
 *
 * Logger format's main module.
 */
'use strict';

const {isIP} = require('net');
const Format = require('../format.js');
const {cap, url, escape, encode, isIPRange} = require('../../include/util.js');
const Logging = require('../../include/log.js');
const Transport = require('../../transports/transport.js');
const Message = require('../../parser/msg.js');

const P_REGEX = /^<p>(.*)(?:<\/p>)?$/u;

/**
 * Logger format's class.
 * @augments Format
 */
class Logger extends Format {
    /**
     * Class constructor.
     * @param {object} config Format configuration
     * @param {Transport} transport Transport used for the format
     */
    constructor(config, transport) {
        super(config, transport);
        this._logger = new Logging({
            file: true,
            name: 'logger-format',
            stdout: true
        });
        this._i18n = require('./i18n/en.json');
        if (config.language && config.language !== 'en') {
            try {
                const i18n = require(`./i18n/${config.language}.json`);
                this._i18n = {
                    ...this._i18n,
                    ...i18n
                };
            } catch (e) {
                if (e.code === 'MODULE_NOT_FOUND') {
                    this._logger.warn(
                        'Translation for language',
                        config.language,
                        'does not exist!'
                    );
                } else {
                    this._logger.error('Loading i18n failed:', e);
                }
            }
        }
        this._transportType = this._transport.constructor.name;
    }
    /**
     * Formats the RC message.
     * @param {Message} message Message to format
     * @returns {object} Formatted message
     */
    execute(message) {
        const func = this[`_handle${cap(message.type)}`];
        if (typeof func === 'function') {
            const result = func.call(this, message);
            switch (this._transportType) {
                case 'Slack': return {
                    text: result
                };
                default: return {
                    content: result
                };
            }
        }
        this._logger.error('Cannot find handler for type', message.type);
        return null;
    }
    /**
     * Handles edits.
     * @param {Message} m Message to format
     * @returns {object} Formatted message
     * @private
     */
    _handleEdit(m) {
        const newPage = m.flags.includes('N');
        const commonArgs = [
            m.wiki,
            m.language,
            m.domain,
            m.user,
            m.page,
            m.diff
        ];
        if (newPage) {
            return this._msg('new', ...commonArgs, m.summary);
        }
        return this._msg('edit', ...commonArgs, m.params.diff, m.summary);
    }
    /**
     * Handles logs.
     * @param {Message} m Message to format
     * @returns {object} Formatted message
     * @private
     */
    _handleLog(m) {
        const wldu = [m.wiki, m.language, m.domain, m.user];
        let temp = null;
        let temp2 = null;
        let temp3 = null;
        let action = '';
        switch (m.log) {
            case 'block': switch (m.action) {
                case 'block':
                case 'reblock':
                    return this._msg(
                        m.action,
                        ...wldu,
                        m.target,
                        m.expiry,
                        m.flags.join(', '),
                        m.reason
                    );
                case 'unblock':
                    return this._msg('unblock', ...wldu, m.target, m.reason);
                default:
                    return '';
            }
            case 'newusers':
                return this._msg('newusers', ...wldu);
            case 'delete':
                if (m.action === 'revision' || m.action === 'event') {
                    action = m.action === 'revision' ? 'revdel' : 'logdel';
                    return this._msg(action, ...wldu, m.target, m.reason);
                }
                action = m.action === 'delete_redir' ? 'deleteredir' : m.action;
                return this._msg(action, ...wldu, escape(m.page), m.reason);
            case 'move':
                return this._msg(
                    m.action === 'move_redir' ? 'moveredir' : 'move',
                    ...wldu,
                    escape(m.page),
                    m.target,
                    (m.reason || '')
                        .replace('[[\x0302', '[[')
                        .replace('\x0310]]', ']]')
                );
            case 'rights':
                temp3 = this._transportType === 'Slack' ? '*' : '**';
                temp = m.oldgroups.map(function(group) {
                    if (m.newgroups.includes(group)) {
                        return group;
                    }
                    return `${temp3}${group}${temp3}`;
                }, this).join(', ') || this._i18n['rights-none'];
                temp2 = m.newgroups.map(function(group) {
                    if (m.oldgroups.includes(group)) {
                        return group;
                    }
                    return `${temp3}${group}${temp3}`;
                }).join(', ') || this._i18n['rights-none'];
                return this._msg(
                    'rights',
                    ...wldu,
                    m.target,
                    temp,
                    temp2,
                    m.reason
                );
            case 'upload':
                return this._msg(
                    m.action === 'overwrite' ? 'reupload' : 'upload',
                    ...wldu,
                    `File:${m.file}`,
                    m.file,
                    m.reason
                );
            case 'protect':
                if (m.action === 'unprotect') {
                    return this._msg('unprotect', ...wldu, m.page, m.reason);
                } else if (m.action === 'move_prot') {
                    return this._msg(
                        'moveprotect',
                        ...wldu,
                        m.page,
                        m.target,
                        m.reason
                    );
                }
                return this._msg(
                    m.action === 'modify' ? 'reprotect' : 'protect',
                    ...wldu,
                    m.page,
                    m.level
                        .map(lv => `[${lv.feature}=${lv.level}] (${lv.expiry})`)
                        .join(' '),
                    m.reason
                );
            case 'abusefilter':
                return this._msg('abusefilter', ...wldu, m.id, m.diff);
            // patrol doesn't need to be logged
            default:
                return '';
        }
    }
    /**
     * Handles Discussions.
     * @param {Message} m Message to format
     * @returns {object} Formatted message
     * @private
     */
    _handleDiscussions(m) {
        const trimmedSnippet = m.snippet.trim().replace(P_REGEX, '$1');
        if (m.hit) {
            return this._msg(
                'discussions-abuse-filter-hit',
                m.wiki,
                m.language,
                m.domain,
                m.user,
                m.hit,
                m.size,
                m.category,
                trimmedSnippet
            );
        }
        return this._msg(
            'discussions',
            m.wiki,
            m.language,
            m.domain,
            m.user,
            m.dtype === 'report' ?
                this._i18n['discussions-create-report'] :
                m.action === 'created' ?
                    this._i18n['discussions-create-post'] :
                    this._i18n[`discussions-${m.action}`],
            m.title,
            m.platform,
            m.thread,
            m.reply,
            m.size,
            m.page || m.category,
            trimmedSnippet
        );
    }
    /* eslint-disable max-statements */
    /**
     * Formats an RC message by type.
     * @param {string} key I18n message key
     * @param {string} wiki Wiki where the message occurred
     * @param {string} lang Language of the wiki
     * @param {string} domain Domain of the wiki
     * @param {Array} args Arguments for the message
     * @returns {object} Formatted message
     */
    _msg(key, wiki, lang, domain, ...args) {
        const string = this._i18n[key];
        if (!string) {
            return key ?
                `Unknown message key: ${key}` :
                'Undefined message key';
        }
        let mode = 0;
        let temp = 0;
        let result = '';
        const templates = [];
        const tArgs = [];
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
                        lang,
                        domain,
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
        // In case of an argument at the end of a string.
        if (mode === 1 && temp > 0) {
            // TODO: DRY.
            const arg = args[temp - 1];
            result += typeof arg === 'undefined' || arg === null ?
                '' :
                String(arg);
            temp = 0;
        }
        return result;
    }
    /* eslint-enable max-statements */
    /**
     * Makes a Markdown link.
     * @param {string} text Text in the link
     * @param {string} wiki Wiki for the link
     * @param {string} lang Language for the wiki
     * @param {string} domain Domain of the wiki
     * @param {string} link URL in the link
     * @returns {string} Markdown link
     */
    _link(text, wiki, lang, domain, link) {
        const wikiURL = url(wiki, lang, domain);
        // Escape the link-ending character
        const replacedLink = link
            .replace(/\|/ug, '%7C')
            .replace(/\)/ug, '%29');
        // Escape the text as well as the link-ending character
        const escapedText = escape(text)
            .replace(/<|>/ug, '')
            .replace(/\[|\]/ug, '');
        if (this._transportType === 'Slack') {
            // Slack link: <link|text>
            return `<${wikiURL}/${replacedLink}|${escapedText}>`;
        }
        // Markdown link: [Text](Link)
        return `[${escapedText}](<${wikiURL}/${replacedLink}>)`;
    }
    /**
     * Makes a Markdown link to a wiki page.
     * @param {string} text Text in the link
     * @param {string} wiki Wiki to link to
     * @param {string} lang Language of the wiki
     * @param {string} domain Domain of the wiki
     * @param {string} page Page to link to
     * @returns {string} Markdown link
     */
    _wikiLink(text, wiki, lang, domain, page) {
        return this._link(text, wiki, lang, domain, `wiki/${encode(page)}`);
    }
    /**
     * Forms a path to a Discussions-based post.
     * @param {string} platform Platform the post was made on
     * @param {string} thread ID of the thread the post is on
     * @param {string} reply ID of the post if it's a reply
     * @param {string} page Page the post was posted on
     * @returns {string} The path to the post
     */
    _discussionsPath(platform, thread, reply, page) {
        switch (platform) {
            case 'discussion':
                return `f/p/${reply ? `${thread}/r/${reply}` : thread}`;
            case 'message-wall':
                return `wiki/Message_Wall:${encode(page)}?threadId=${reply ? `${thread}#${reply}` : thread}`;
            case 'article-comment':
                return `wiki/${encode(page)}?commentId=${reply ? `${thread}&replyId=${reply}` : thread}`;
            default:
                this._logger.error(`Unknown Discussions platform: ${platform}`);
                return 'unknown_discussions_platform';
        }
    }
    /* eslint-disable complexity */
    /**
     * Processes templates in i18n strings.
     * @param {string} wiki Related wiki for linking
     * @param {string} lang Language of the wiki for linking
     * @param {string} domain Domain of the wiki
     * @param {string} type Template type
     * @param {string[]} args Template arguments
     * @returns {string} Processed template
     */
    _template(wiki, lang, domain, type, ...args) {
        let temp = null;
        let temp1 = null;
        const wld = [wiki, lang, domain];
        let userLink = '';
        let talkLink = '';
        let contribsLink = '';
        switch (type) {
            case 'user':
                // Discussions does not relay the username for anons
                if (args[0] === '') {
                    return 'An unknown anonymous user';
                }
                // Hack for autoblocks and range blocks
                if (args[0].startsWith('#') || isIPRange(args[0])) {
                    return escape(args[0]);
                }
                if (isIP(args[0])) {
                    return this._wikiLink(
                        args[0],
                        ...wld,
                        `Special:Contribs/${args[0]}`
                    );
                }
                userLink = this._wikiLink(args[0], ...wld, `User:${args[0]}`);
                talkLink = this._wikiLink(this._i18n.talk, ...wld, `User talk:${args[0]}`);
                contribsLink = this._wikiLink(this._i18n.contribs, ...wld, `Special:Contribs/${args[0]}`);
                return `${userLink} (${talkLink}|${contribsLink})`;
            case 'link':
                return this._wikiLink(args[1] || args[0], ...wld, args[0]);
            case 'diff':
                return `(${this._link(
                    this._i18n.diff,
                    ...wld,
                    `?diff=${args[0]}`
                )})`;
            case 'diffSize':
                if (this._transportType === 'Slack') {
                    temp = args[0] > 500 || args[0] < -500 ? '*' : '_';
                } else {
                    temp = '*'.repeat(args[0] > 500 || args[0] < -500 ? 2 : 1);
                }
                if (args[0] > 0) {
                    args[0] = `+${args[0]}`;
                }
                return `${temp}(${args[0]})${temp}`;
            case 'summary':
                temp = args[0].trim();
                temp1 = this._transportType === 'Slack' ? '_' : '*';
                return temp.length === 0 ?
                    '' :
                    `(${temp1}${escape(temp.replace(/(?:\n|\r|\s)+/ug, ' '))}${temp1})`;
            case 'dlink':
                return this._link(
                    args[0] || (
                        args[1] === 'article-comment' ?
                            this._i18n['article-comment-comment'] :
                            this._i18n['discussions-reply']
                    ),
                    ...wld,
                    this._discussionsPath(args[1], args[2], args[3], args[4])
                );
            case 'flags':
                return args[0] ? `[${args[0]}] ` : '';
            case 'board':
                return this._msg(`${args[1]}-board`, ...wld, escape(args[0]));
            case 'flink':
                return this._wikiLink(args[0], ...wld, `Special:DiscussionsAbuseFilter/examine/log/${args[0]}`);
            default:
                return '';
        }
    }
    /* eslint-enable complexity */
    /**
     * Disposes resources used by the format so KockaLogger can cleanly exit.
     */
    kill() {
        this._logger.close();
    }
}

module.exports = Logger;
