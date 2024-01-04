#!/bin/bash

set -e

project=__app_name__

printHelp () {
	echo "Usage: control.sh <command>"
	echo "Available commands:"
	echo
	echo "   start        Pulls changes, builds docker image(s), and starts"
	echo "                the services (Nginx, Node.js)."
	echo "   startdev     Pulls changes, builds docker image(s), and starts"
	echo "                the services (Nginx, Node.js)."
	echo
	echo "   reloadnginx  Reloads the nginx configuration"
	echo
	echo "   stop         Stops the services."
	echo
	echo "   logs         Tail -f services' logs."
	echo
	echo "   shell        Opens a shell into the Node.js container."
	echo
	echo "   shellnginx   Opens a shell into the Nginx container."
	echo
	echo "   dbbackup     Takes a SQL dumb of the database and stores it in backup.sql"
}

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
pushd $dir > /dev/null

mkdir -p data/postgres

case "$1" in
start)
	docker compose -p $project -f docker-compose.base.yml -f docker-compose.prod.yml build
	docker compose -p $project -f docker-compose.base.yml -f docker-compose.prod.yml up -d
	;;
startdev)
	docker compose -p $project -f docker-compose.base.yml down -t 1
	docker compose -p $project -f docker-compose.base.yml -f docker-compose.dev.yml build
	docker compose -p $project -f docker-compose.base.yml -f docker-compose.dev.yml up
	;;
reloadnginx)
	docker exec -it ${project}_nginx nginx -t
	docker exec -it ${project}_nginx nginx -s reload
	;;
stop)
	docker compose -p $project -f docker-compose.base.yml down -t 1
	;;
shell)
	docker exec -it ${project}_server bash
	;;
shellnginx)
	docker exec -it ${project}_nginx bash
	;;
logs)
	docker compose -p $project -f docker-compose.base.yml logs -f
	;;
dbbackup)
	docker exec -it ${project}_postgres bash -c 'pg_dump -U ${project} ${project}_db > /backup/backup.sql'
	;;
*)
	echo "Invalid command $1"
	printHelp
	;;
esac

popd > /dev/null