'use strict';
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
// --- Configuration Loading ---
const APP_CONFIG_FILE = 'sshm.json';
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(BASE_DIR, APP_CONFIG_FILE);
const DEFAULT_CONFIG = {
    app_port: 3333,
    app_host: '127.0.0.1',
    terminal_defaults: { fontFamily: "monospace", fontSize: 12, minWidth: 800 },
    groups: [{
        group: "localhost_default",
        hosts: [{ label: "localhost", user: "user", host: "127.0.0.1", port: 22, password: "password" }]
    }]
};
let appConfig = { ...DEFAULT_CONFIG };
// --- Config Loading Logic ---
function loadConfig() {
    console.log(`> Loading configuration from: ${CONFIG_PATH}...`);
    if (!fs.existsSync(CONFIG_PATH)) {
        console.warn(`> Configuration file not found. Creating default.`);
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
            console.log(`> Default configuration written to ${CONFIG_PATH}`);
        } catch (err) {
            console.error(`> ERROR writing default config:`, err.message);
        }
    } else {
        try {
            const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
            const parsedConfig = JSON.parse(rawConfig);
            appConfig = {
                ...DEFAULT_CONFIG, ...parsedConfig,
                terminal_defaults: { ...DEFAULT_CONFIG.terminal_defaults, ...(parsedConfig.terminal_defaults || {}) },
                groups: Array.isArray(parsedConfig.groups) ? parsedConfig.groups : DEFAULT_CONFIG.groups
            };
            console.log(`> Configuration loaded successfully. Found ${appConfig.groups.length} groups.`);
        } catch (err) {
            console.error(`> ERROR reading or parsing ${APP_CONFIG_FILE}:`, err.message);
            console.warn('> Using default configuration due to error.');
            appConfig = { ...DEFAULT_CONFIG };
        }
    }
}
loadConfig();
const PORT = appConfig.app_port;
const HOST = appConfig.app_host;
// --- Express Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const vendorPath = (pkg, sub = '') => path.join(__dirname, 'node_modules', pkg, sub);
app.use('/vendor/socket.io', express.static(vendorPath('socket.io-client', 'dist')));
app.use('/vendor/xterm/css', express.static(vendorPath('@xterm/xterm', 'css')));
app.use('/vendor/xterm/lib', express.static(vendorPath('@xterm/xterm', 'lib')));
app.use('/vendor/xterm-addon-fit/lib', express.static(vendorPath('@xterm/addon-fit', 'lib')));
app.use(express.static(path.join(__dirname, 'public')));
// --- State & Helpers ---
const activeSessions = {};
const generateConnId = (hc) => `${hc.user}@${hc.host}:${hc.port}`;
const getDisplayHostString = (hc) => hc.label || `${hc.user}@${hc.host}`;

function findHostConfigByConnId(connId) {
    for (const group of appConfig.groups) {
        for (const host of group.hosts) {
            if (generateConnId(host) === connId) return host;
        }
    }
    return null;
}

function closeSshConnection(socketId, connId, reason) {
    const session = activeSessions[socketId];
    if (!session?.connections?.[connId]) {
        return false;
    }
    console.log(`[${socketId}] Closing SSH connection: ${connId} (Reason: ${reason || 'unknown'})`);
    const { conn, stream } = session.connections[connId];
    delete session.connections[connId];
    stream?.destroy();
    conn?.destroy();
    return true;
}

function closeAllSocketSshConnections(socketId, reason) {
    const session = activeSessions[socketId];
    if (!session?.connections) return;
    const connIds = Object.keys(session.connections);
    if (connIds.length > 0) {
        console.log(`[${socketId}] Closing ${connIds.length} SSH connections... (Reason: ${reason || 'unknown'})`);
        [...connIds].forEach(connId => closeSshConnection(socketId, connId, reason));
    }
}

function cleanupSocketSession(socketId, reason = 'unknown') {
    if (!activeSessions[socketId]) return;
    console.log(`> Client disconnected: ${socketId}. Reason: ${reason}`);
    closeAllSocketSshConnections(socketId, `Socket ${reason}`);
    delete activeSessions[socketId];
}

// --- SSH Connection Logic ---
function attemptSshConnection(socket, hostConfig) {
    const socketId = socket.id;
    if (!activeSessions[socketId]) return;
    const connId = generateConnId(hostConfig);
    const displayHostString = getDisplayHostString(hostConfig);
    if (!hostConfig.user || !hostConfig.host || !hostConfig.port || typeof hostConfig.password === 'undefined') {
        socket.emit('term.error', connId, `Config incomplete for ${displayHostString}`);
        return;
    }
    const conn = new Client();
    console.log(`[${socketId}] Attempting SSH to ${displayHostString} (${hostConfig.host}:${hostConfig.port})`);

    const handleStreamCloseOrEnd = (eventType) => {
        const closedSuccessfully = closeSshConnection(socketId, connId, `Stream ${eventType}`);
        if (closedSuccessfully && activeSessions[socketId]) {
            socket.emit('term.close', connId, `Stream ${eventType}`);
        }
    };

    conn.on('ready', () => {
        if (!activeSessions[socketId]) { conn.destroy(); return; }
        console.log(`[${socketId}] SSH ready for ${displayHostString}`);
        conn.shell({ term: 'xterm-color', rows: 24, cols: 80 }, (err, stream) => {
            if (!activeSessions[socketId]) { stream?.destroy(); conn.destroy(); return; }
            if (err) {
                console.error(`[${socketId}] SSH shell error for ${displayHostString}: ${err.message}`);
                socket.emit('term.error', connId, `Shell error: ${err.message}`);
                closeSshConnection(socketId, connId, 'Shell error');
                return;
            }
            const currentSession = activeSessions[socketId];
            if (currentSession.connections) {
                currentSession.connections[connId] = { conn, stream };
                socket.emit('term.shell.ready', connId);
                // FIXED: The data from the stream MUST be converted to a string before sending over Socket.IO.
                stream.on('data', (data) => activeSessions[socketId] && socket.emit('term.data', connId, data.toString('utf8')));
                stream.stderr.on('data', (data) => activeSessions[socketId] && socket.emit('term.data', connId, `\x1b[31m${data.toString('utf8')}\x1b[0m`));
                stream.once('close', () => handleStreamCloseOrEnd('closed'));
                stream.once('end', () => handleStreamCloseOrEnd('ended'));
            } else {
                console.warn(`[${socketId}] Socket disconnected during stream setup for ${displayHostString}`);
                stream?.destroy(); conn.destroy();
            }
        });
    }).on('error', (err) => {
        const errorMessage = err.message || 'Unknown connection error';
        console.error(`[${socketId}] SSH connection error for ${displayHostString}: ${errorMessage} (Level: ${err.level})`);
        if (activeSessions[socketId]) {
            const displayError = errorMessage.includes('authentication methods failed')
                ? 'Authentication failed (check password/server config)'
                : `Connect Error: ${errorMessage}`;
            socket.emit('term.error', connId, displayError);
        }
        closeSshConnection(socketId, connId, 'Connection error');
    }).on('end', () => {
        console.log(`[${socketId}] SSH connection ended for ${connId} (likely after stream close or error).`);
        closeSshConnection(socketId, connId, 'Connection ended');
    }).connect({
        host: hostConfig.host, port: hostConfig.port, username: hostConfig.user,
        password: hostConfig.password, tryKeyboard: true,
        readyTimeout: 20000, keepaliveInterval: 15000
    });
}

// --- Socket.IO Event Handling ---
io.on('connection', (socket) => {
    const socketId = socket.id;
    console.log(`> Client connected: ${socketId}`);
    activeSessions[socketId] = { connections: {} };
    socket.emit('appConfig', { terminalDefaults: appConfig.terminal_defaults });
    socket.emit('groups', appConfig.groups.map(g => g.group));
    socket.on('selectGroup', (groupName) => {
        if (!activeSessions[socketId]) return;
        console.log(`[${socketId}] Selected group: ${groupName}`);
        closeAllSocketSshConnections(socketId, 'Group selected');
        socket.emit('clearTerminals');
        const groupInfo = appConfig.groups.find(g => g.group === groupName);
        if (!groupInfo?.hosts?.length) {
            if (groupName) socket.emit('errorMsg', `Group '${groupName}' not found or empty.`);
            return;
        }
        groupInfo.hosts.forEach(hc => socket.emit('term.create', generateConnId(hc), getDisplayHostString(hc)));
        groupInfo.hosts.forEach(hc => attemptSshConnection(socket, hc));
    });
    socket.on('term.reconnect', (connId) => {
        if (!activeSessions[socketId]) return;
        console.log(`[${socketId}] Reconnect requested for: ${connId}`);
        const hostConfig = findHostConfigByConnId(connId);
        if (hostConfig) {
            closeSshConnection(socketId, connId, 'Reconnect requested');
            socket.emit('term.create', connId, getDisplayHostString(hostConfig));
            attemptSshConnection(socket, hostConfig);
        } else {
            console.error(`[${socketId}] Host config not found for reconnect: ${connId}`);
            socket.emit('term.error', connId, 'Cannot reconnect: Host config not found.');
        }
    });
    socket.on('term.input.specific', (connId, data) => {
        activeSessions[socketId]?.connections[connId]?.stream?.write(data);
    });
    socket.on('term.input.broadcast.key', (keySequence) => {
        const connections = activeSessions[socketId]?.connections;
        if (connections) {
            Object.values(connections).forEach(({ stream }) => stream?.writable && stream.write(keySequence));
        }
    });
    socket.on('term.resize', (connId, cols, rows) => {
        activeSessions[socketId]?.connections[connId]?.stream?.setWindow(rows, cols, (err) => {
            if (err) {
                 console.warn(`[${socketId}] Error resizing terminal ${connId}: ${err.message}`);
            }
        });
    });
    socket.on('disconnect', (reason) => cleanupSocketSession(socketId, reason));
    socket.on('error', (error) => {
        console.error(`Socket error for ${socketId}:`, error);
        cleanupSocketSession(socketId, 'socket error');
    });
});
// --- Server Start & Shutdown ---
server.listen(PORT, HOST, () => {
    console.log(`\n> SSH Multiplexer started.`);
    console.log(`> Listening on: http://${HOST}:${PORT}`);
    console.log(`> Configuration file: ${path.relative(process.cwd(), CONFIG_PATH)}`);
    console.log(`> Press Ctrl+C to shut down.\n`);
});
process.on('SIGINT', () => {
    console.log('\n\n> SIGINT received. Shutting down gracefully...');
    const activeSocketIds = Object.keys(activeSessions);
    activeSocketIds.forEach(sid => closeAllSocketSshConnections(sid, 'Server shutdown'));
    io.close(() => console.log("> Socket.IO server closed."));
    server.close(() => {
        console.log('> HTTP server closed.');
        process.exit(0);
    });
    setTimeout(() => { console.error('> Graceful shutdown timed out. Forcing exit.'); process.exit(1); }, 5000);
});
