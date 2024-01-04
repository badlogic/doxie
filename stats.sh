#!/bin/sh
set -e
host=__app_host__
host_dir=__app_host_dir__/__app_domain__
scp $host:$host_dir/docker/data/logs/npmaccess.log access.log
goaccess --keep-last=30 -f access.log -o report.html --log-format=COMBINED
rm access.log
open report.html