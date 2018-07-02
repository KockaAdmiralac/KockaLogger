# KockaLogger
KockaLogger is a [Node.js](https://nodejs.org) program used to replace [WikiaActivityLogger](https://github.com/KockaAdmiralac/WikiaActivityLogger)  and, eventually, [CVNAdvanced](https://github.com/KockaAdmiralac/CVNAdvanced) in their tasks of filtering and logging [Wikia](https://c.wikia.com) activity.

After Wikia decided to forbid WikiaActivityLogger on 25th June 2018, they provided an alternative solution to wiki activity logging that does not consume as much server (and bot) resources. This solution, however, is not publicly available and therefore KockaLogger cannot be used by any Wikia user like WikiaActivityLogger could. If you had been running a WikiaActivityLogger instance before Wikia decided to forbid its use, contact [KockaAdmiralac](https://dev.wikia.com/wiki/User_talk:KockaAdmiralac) about it.

## Configuration
Configuration consists of two parts, client configuration and modules configuration. Sample configuration can be found in `config.sample.json`.

### Client configuration
Contains following properties:
- `server` - IRC server to connect to
- `port` - IRC port to connect to
- `nick` - IRC nick to use
- `username` - IRC username to use, defaults to nickname
- `realname` - IRC realname to use
- `channels` - Contains three properties, `rc`, `newusers` and `discussions` representing the names of channels with these functions on the network
- `users` - Same as `channels` but for names of the bots in these channels. If bots change names, just put their common prefix here

### Modules configuration
Consists of a map of objects representing certain modules of KockaLogger. Currently, only available module is `logger`, which is meant to replace WikiaActivityLogger in function.

#### Logger configuration
Logger module configuration consists of an array of objects representing combinations of wikis, transport methods and formatting methods. Currently, only supported transport method is `discord` and only supported formatting method is `logger` (default).

In the configuration for the `discord` transport should be two properties, `id` and `token`, representing the ID and token of the webhook to transport activity to. For example, if your webhook URL is:
```
https://discordapp.com/api/webhooks/123456789012345678/aHDAkNAjao_l4JAS9A0qkl04pASCjLASD-ASLKjQWE_MASDA0ijASjkh23Spoqk-02nk
```
your webhook ID will be `123456789012345678` and your webhook token will be `aHDAkNAjao_l4JAS9A0qkl04pASCjLASD-ASLKjQWE_MASDA0ijASjkh23Spoqk-02nk`.

## Running
Install all the required modules using:
```console
$ npm install
```

Before running, you must generate the i18n cache that will be used when parsing log messages. To do so, run
```console
$ node messages/main.js
```
from the root directory of the project. If you want to view prettified versions of `messagecache.json` and `i18n.json`, add a `--debug` flag to the command.

To run KockaLogger, use:
```console
$ npm start
```

## Translation
To be described later

## To do
- Link directly to replies in thread links
- Cache for Discussions thread titles
- New users transport
- New wikis log
- Basic summary filter
- Basic XRM
- Handle "Created page with summaries"
- Memory usage checking and optimization
- CLI
- GUI?
- Proper error logs
- Article/blog comments displaying prettier
- Log AbuseFilter hits within the `logging` module
- Separating wiki from Discussions logs and CVNAdvanced-style Discussions logs
