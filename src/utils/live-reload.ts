export function setupLiveReload() {
    if (!location.host.includes("localhost") && !location.host.includes("192.168.1")) return;
    var socket = new WebSocket("ws://" + location.hostname + ":3333");
    socket.onmessage = (ev) => {
        location.reload();
    };
}
