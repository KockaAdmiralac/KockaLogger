# KockaLogger
![ESLint GitHub Actions badge](https://github.com/KockaAdmiralac/KockaLogger/actions/workflows/lint.yml/badge.svg)

KockaLogger is a [Node.js](https://nodejs.org) program used to replace [WikiaActivityLogger](https://github.com/KockaAdmiralac/WikiaActivityLogger)  and, eventually, [CVNAdvanced](https://github.com/KockaAdmiralac/CVNAdvanced) in their tasks of filtering and logging [Fandom](https://community.fandom.com) activity.

After Fandom decided to forbid WikiaActivityLogger on 25th June 2018, they provided an alternative solution to wiki activity logging that does not consume as much server (and bot) resources. This solution, however, is not publicly available and therefore KockaLogger cannot be used by any Fandom user like WikiaActivityLogger could. If you had been running a WikiaActivityLogger instance before Fandom decided to forbid its use, contact [KockaAdmiralac](https://dev.fandom.com/wiki/User_talk:KockaAdmiralac) about it.

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
Consists of a map of objects representing certain modules of KockaLogger. Currently, only documented module is `logger`, which is meant to replace WikiaActivityLogger in function.

#### Logger configuration
Logger module configuration consists of an array of objects representing combinations of wikis, transport methods and formatting methods. Currently, only supported transport method is `discord` and only supported formatting method is `logger` (default).

In the configuration for the `discord` transport should be two properties, `id` and `token`, representing the ID and token of the webhook to transport activity to. For example, if your webhook URL is:
```
https://discord.com/api/webhooks/123456789012345678/aHDAkNAjao_l4JAS9A0qkl04pASCjLASD-ASLKjQWE_MASDA0ijASjkh23Spoqk-02nk
```
your webhook ID will be `123456789012345678` and your webhook token will be `aHDAkNAjao_l4JAS9A0qkl04pASCjLASD-ASLKjQWE_MASDA0ijASjkh23Spoqk-02nk`.

## Running
Install all the required modules using:
```console
$ npm install
```

To run KockaLogger, use:
```console
$ node main.js
```

### Command-line options
- After the first run, KockaLogger will fetch required system messages and store them in cache. If you want to re-fetch system messages, pass a `--fetch` command-line option to the main script.
- To enable JSON pretty-printing in cache, pass a `--debug` command-line option
- To regenerate system messages without fetching them, pass a `--generate` command-line option.

## Contributing
To contribute to KockaLogger, see `CONTRIBUTING.md`.

## Issues
KockaLogger bugs and feature requests are tracked through [GitHub issues](https://github.com/KockaAdmiralac/KockaLogger/issues) in this repository. Feel free to open one if you need help with setting up, want to report a bug or suggest a feature or just ask for general information about KockaLogger.
