#!/bin/bash
set -e
npm run build
host=slayer.marioslab.io
host_dir=/home/badlogic/doxie.marioslab.io
current_date=$(date "+%Y-%m-%d %H:%M:%S")
commit_hash=$(git rev-parse HEAD)
echo "{\"date\": \"$current_date\", \"commit\": \"$commit_hash\"}" > html/version.json

ssh -t $host "mkdir -p $host_dir/docker/data/postgres"
rsync -avz --exclude node_modules --exclude .git --exclude data --exclude jnn/target --exclude jnn/libs --exclude docker/data ./ $host:$host_dir

# Create .env file on remote server in docker directory
ssh $host "cat > $host_dir/docker/.env << 'EOF'
DOXIE_OPENAI_KEY=$DOXIE_OPENAI_KEY
DOXIE_COHERE_KEY=$DOXIE_COHERE_KEY
DOXIE_ADMIN_TOKEN=$DOXIE_ADMIN_TOKEN
DOXIE_DB_PASSWORD=$DOXIE_DB_PASSWORD
EOF"

if [ "$1" == "server" ]; then
    echo "Publishing client & server"
    ssh -t $host "cd $host_dir && ./docker/control.sh stop && ./docker/control.sh start && ./docker/control.sh logs"
else
    echo "Publishing client only"
fi