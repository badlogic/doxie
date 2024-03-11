#!/bin/bash
dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
pushd $dir > /dev/null

MAIN_CLASS="com.badlogicgames.jnn.Main"
DEBUG_PORT=12564
export JNN_PORT=$PORT

cleanup() {
    echo "Terminating JVM..."
    pkill -f "java -cp .* $MAIN_CLASS"
    echo "Exiting script."
    exit 0
}

compile_and_run() {
    echo "Restarting ..."
    pkill -f "java -cp .* $MAIN_CLASS"

    rm -rf libs
    mvn dependency:copy-dependencies -DoutputDirectory=libs

    mvn -f "pom.xml" clean compile

    CLASSPATH=$(echo libs/*.jar | tr ' ' ':')
    CLASSPATH="$CLASSPATH:target/classes"
    echo "Classpath: $CLASSPATH"

    if [ ! -z "$DEV" ]; then
        echo "Starting in debug mode"
        java -cp "$CLASSPATH" -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:$DEBUG_PORT "$MAIN_CLASS" &
    else
        echo "Starting in prod mode"
        java -cp "$CLASSPATH" "$MAIN_CLASS" &
    fi

    trap cleanup SIGINT
}

compile_and_run

# Poor man's file system polling
if [ ! -z "$DEV" ]; then
    last_check_time=$(date +%s)
    while true; do
        current_check_time=$(date +%s)
        newest_mod_time=$(find src/ -type f -exec stat --format="%Y" {} + | sort -n | tail -1)
        pom_mod_time=$(stat --format="%Y" pom.xml)

        if [[ $pom_mod_time -gt $newest_mod_time ]]; then
            newest_mod_time=$pom_mod_time
        fi

        if [[ $newest_mod_time -gt $last_check_time ]]; then
            compile_and_run
            last_check_time=$newest_mod_time
        fi
        sleep 1
    done
fi
popd