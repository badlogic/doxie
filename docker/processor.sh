#!/bin/bash
dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
pushd $dir/.. > /dev/null

if [ -z "$DEV" ]; then
echo "Starting processor in prod mode"
	node --enable-source-maps build/processor.js
else
    echo "Starting server in dev mode"
	node --watch --enable-source-maps --inspect-brk=0.0.0.0:9231 build/processor.js
fi