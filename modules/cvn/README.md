# CVN module
This module is supposed to create a replacement for `#cvn-wikia` channel on Freenode. Diagram of infrastructure can be found in `diagram.xml` (import into [draw.io](https://draw.io)).

## User flags
- `n` (new) *[cache-only]*
- `w` (whitelist)
- `b` (blacklist)
- `g` (greylist) *[cache-only]*
- `v` (VSTF)
- `h` (Helper)
- `s` (Staff)
- `q` (QA)
- `ba` (badmin)

## Message types
- creations
- edits
- blocks
- moves
- new users

## Blacklists
- `s` (summary)
- `t` (title)
- `c` (content?)
- `u` (usernames)

## Commands
- `!list` (`!l`) - Manipulates blacklists
    - `!list flag content` - Displays information about `content`'s presence in the `flag` list
    - `!list +flag content` - Adds `content` in the `flag` list
    - `!list -flag content` - Removes `content` from the `flag` list
    - `!list +flag content -r "Reason"` - Adds `content` in the `flag` list with `Reason` as a reason
- `!user` (`!u`) - Manipulates user lists
    - `!user User` - Checks lists of `User`
    - `!user User +flag` - Adds a flag to `User`
    - `!user User -flag` - Removes a flag from `User`
    - `!user User +flag -r "Reason"` - Adds a flag to `User` with a specified reason
- `!status` (`!s`) - Displays CVN module's status
- `!help` (`!h`, `!commands`, `!c`) - Displays this help
