#!/bin/bash
set -e
cd "${0%/*}"

startup () {
    redis-server redis.conf
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
