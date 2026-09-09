'use strict';
const SshClient = require('./SshClient');

class SessionManager {
    constructor() {
        this.sessions = {};
    }

    createSession(socketId) {
        this.sessions[socketId] = { connections: {} };
    }

    destroySession(socketId) {
        const session = this.sessions[socketId];
        if (!session) return;
        this.disconnectAll(socketId);
        delete this.sessions[socketId];
    }

    connect(socketId, connId, hostConfig, callbacks) {
        const session = this.sessions[socketId];
        if (!session) return;
        const client = new SshClient(hostConfig, callbacks);
        session.connections[connId] = { client, connId };
        client.connect();
    }

    disconnect(socketId, connId) {
        const session = this.sessions[socketId];
        if (session?.connections[connId]) {
            session.connections[connId].client.disconnect();
            delete session.connections[connId];
            return true;
        }
        return false;
    }

    disconnectAll(socketId) {
        const session = this.sessions[socketId];
        if (!session) return;
        Object.values(session.connections).forEach(c => c.client.disconnect());
        session.connections = {};
    }

    write(socketId, connId, data) {
        this.sessions[socketId]?.connections[connId]?.client.write(data);
    }

    broadcast(socketId, data) {
        const connections = this.sessions[socketId]?.connections;
        if (connections) {
            Object.values(connections).forEach(c => c.client.write(data));
        }
    }

    resize(socketId, connId, cols, rows) {
        this.sessions[socketId]?.connections[connId]?.client.resize(cols, rows);
    }

    destroyAll() {
        Object.keys(this.sessions).forEach(sid => this.destroySession(sid));
    }
}

module.exports = SessionManager;
