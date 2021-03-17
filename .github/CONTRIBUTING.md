# Contribution Guidelines
## Code contribution
1. Before opening a pull request, please contact KockaAdmiralac via email (`1405223@gmail.com`), Discord (`KockaAdmiralac#9306`) or [issues](https://github.com/KockaAdmiralac/KockaLogger/issues) in this repository (by creating an issue for your bug).
2. Make sure the contributed code follows code style guidelines from `.eslintrc.json`. Try to make commited code have as little linter issues as possible.
3. If you're able to test the contributed code, please test it. Otherwise, note the code has not been tested in your pull request (unless it's a really minor change).

## Translation
To translate KockaLogger's logging module you would need to translate JSON files located in `formats/logger/i18n`. The English translation can be found in the `en.json` file. Template names (`{{something|...}}`) and variables (`$1`, `$2`...) should not be translated.

As of KockaLogger v1.2.1 (2021-03-17), all translations require some updates for newly added messages.

After translation updates, the patch version of KockaLogger needs to be increased by 1. If you're confused by what some things in the messages mean, read `qqq.json` for full documentation about message and parameter meanings.

## Crediting
All contributions will be credited in the `CREDITS.md` file.
