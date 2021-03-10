#!/bin/bash
set -e
cd "${0%/*}"

if [[ -z "$XDG_CACHE_HOME" ]]; then
    cache_dir="$HOME/.cache"
else
    cache_dir="$XDG_CACHE_HOME"
fi

if [[ -z "$XDG_DATA_HOME" ]]; then
    logs_dir="$HOME/.local/share"
else
    logs_dir="$XDG_DATA_HOME"
fi

startup () {
    mkdir -p "$cache_dir/kocka-logger"
    mkdir -p "$logs_dir/kocka-logger/logs"
    redis-server redis.conf --dir "$cache_dir/kocka-logger" --logfile "$logs_dir/kocka-logger/logs/redis.log"
}

shutdown () {
    redis-cli -p 14052 shutdown
}

case $1 in
    start)
        # Start the Redis server.
        startup
        ;;
    stop)
        # Stop the Redis server.
        shutdown
        ;;
    restart)
        # Restarts the Redis server.
        shutdown
        startup
        ;;
    reset)
        # Resets Redis data and restarts the server.
        shutdown
        rm cache/redis.rdb
        startup
        ;;
    cli)
        # Enters Redis CLI.
        redis-cli -p 14052
        ;;
    *)
        # Outputs usage instructions.
        echo "Usage: $0 start | stop | restart | reset | cli"
        ;;
esac
