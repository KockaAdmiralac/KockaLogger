/**
 * edit.js
 *
 * Module for parsing messages representing edits
 * from the recent changes channel.
 */
'use strict';

/**
 * Importing modules.
 */
const RCMessage = require('./rc.js');

/**
 * Parses WikiaRC messages representing edits.
 * @augments RCMessage
 */
class EditMessage extends RCMessage {
    /**
     * Class constructor.
     * @param {Parser} parser Parser instance
     * @param {String} raw Unparsed WikiaRC message
     * @param {Array} res Regular expression execution result
     */
    constructor(parser, raw, res) {
        super(parser, raw, res, 'edit');
        this.page = res.shift();
        this.flags = res.shift().split('');
        this.wiki = res.shift();
        this.domain = res.shift();
        this.language = res.shift() || 'en';
        this.params = {};
        res.shift().split('&').forEach(this._parseParam, this);
        this.user = res.shift();
        const sign = res.shift(),
              num = Number(res.shift());
        this.diff = sign === '-' ? -num : num;
        this.summary = this._trimSummary(res.shift());
    }
    /**
     * Parses a URL parameter.
     * @param {String} param Parameter to parse
     * @private
     */
    _parseParam(param) {
        const spl = param.split('=');
        this.params[spl[0]] = Number(spl[1]);
    }
}

module.exports = EditMessage;
