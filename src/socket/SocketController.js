'use strict';
const { generateConnId, getDisplayHostString } = require('../utils/connId');
const logger = require('../utils/logger');

class SocketController {
    constructor(io, sessionManager, configService) {
        this.io = io;
        this.sessions = sessionManager;
        this.config = configService;
    }

    initialize() {
        this.io.on('connection', (socket) => this._onConnection(socket));
    }

    _onConnection(socket) {
        const socketId = socket.id;
        logger.info(`> Client connected: ${socketId}`);
        this.sessions.createSession(socketId);

        socket.emit('appConfig', { terminalDefaults: this.config.getTerminalDefaults() });
        socket.emit('groups', this.config.getGroupNames());

        socket.on('selectGroup', (groupName) => this._selectGroup(socket, groupName));
        socket.on('term.reconnect', (connId) => this._reconnect(socket, connId));
        socket.on('term.input.specific', (connId, data) => this.sessions.write(socketId, connId, data));
        socket.on('term.input.broadcast.key', (data) => this.sessions.broadcast(socketId, data));
        socket.on('term.resize', (connId, cols, rows) => this.sessions.resize(socketId, connId, cols, rows));
        socket.on('disconnect', (reason) => this._disconnect(socketId, reason));
        socket.on('error', () => this._disconnect(socketId, 'socket error'));
    }

    _selectGroup(socket, groupName) {
        const socketId = socket.id;
        logger.info(`[${socketId}] Selected group: ${groupName}`);
        this.sessions.disconnectAll(socketId);
        socket.emit('clearTerminals');

        const hosts = this.config.getHostsByGroup(groupName);
        if (!hosts?.length) {
            if (groupName) socket.emit('errorMsg', `Group '${groupName}' not found or empty.`);
            return;
        }

        hosts.forEach(hc => {
            const connId = generateConnId(hc);
            this._spawnTerminal(socket, hc, connId);
        });
    }

    _spawnTerminal(socket, hostConfig, connId) {
        this.sessions.disconnect(socket.id, connId);
        socket.emit('term.create', connId, getDisplayHostString(hostConfig));
        this._connectSsh(socket, hostConfig, connId);
    }

    _reconnect(socket, connId) {
        const socketId = socket.id;
        logger.info(`[${socketId}] Reconnect requested for: ${connId}`);
        const hostConfig = this.config.findHostByConnId(connId);
        if (hostConfig) {
            this._spawnTerminal(socket, hostConfig, connId);
        } else {
            logger.error(`[${socketId}] Host config not found for reconnect: ${connId}`);
            socket.emit('term.error', connId, 'Cannot reconnect: Host config not found.');
        }
    }

    _connectSsh(socket, hostConfig, connId) {
        const socketId = socket.id;
        const displayHost = getDisplayHostString(hostConfig);

        if (!hostConfig.user || !hostConfig.host || !hostConfig.port || typeof hostConfig.password === 'undefined') {
            socket.emit('term.error', connId, `Config incomplete for ${displayHost}`);
            return;
        }

        logger.info(`[${socketId}] Attempting SSH to ${displayHost} (${hostConfig.host}:${hostConfig.port})`);

        this.sessions.connect(socketId, connId, hostConfig, {
            onReady: () => socket.emit('term.shell.ready', connId),
            onData: (data) => socket.emit('term.data', connId, data),
            onError: (error) => socket.emit('term.error', connId, error),
            onClose: (reason) => {
                this.sessions.disconnect(socketId, connId);
                socket.emit('term.close', connId, reason);
            }
        });
    }

    _disconnect(socketId, reason) {
        logger.info(`> Client disconnected: ${socketId}. Reason: ${reason}`);
        this.sessions.destroySession(socketId);
    }
}

module.exports = SocketController;
