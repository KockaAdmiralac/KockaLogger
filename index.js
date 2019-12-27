/**
 * index.js
 *
 * Main exporting point of KockaLogger.
 */
'use strict';

module.exports = {
    Client: require('./include/client.js'),
    Loader: require('./messages/main.js'),
    Message: require('./parser/msg.js'),
    internal: {
        IO: require('./include/io.js'),
        Logger: require('./include/log.js'),
        Parser: require('./parser/parser.js'),
        Util: require('./include/util.js')
    },
    modules: {
        logger: require('./modules/logger'),
        newusers: require('./modules/newusers'),
        newwikis: require('./modules/newwikis'),
        vandalism: require('./modules/vandalism')
    }
};
