'use strict';
const { Client } = require('ssh2');
const logger = require('../utils/logger');

class SshClient {
    constructor(hostConfig, callbacks) {
        this.hostConfig = hostConfig;
        this.cb = callbacks;
        this.conn = null;
        this.stream = null;
        this._closed = false;
    }

    connect() {
        const { host, port, user, password } = this.hostConfig;
        this.conn = new Client();

        this.conn.on('ready', () => {
            if (this._closed) return;
            this.conn.shell({ term: 'xterm-color', rows: 24, cols: 80 }, (err, stream) => {
                if (this._closed) { stream?.destroy(); return; }
                if (err) {
                    this.cb.onError(`Shell error: ${err.message}`);
                    this._close('Shell error');
                    return;
                }
                this.stream = stream;
                stream.on('data', (data) => {
                    if (!this._closed) this.cb.onData(data.toString('utf8'));
                });
                stream.stderr.on('data', (data) => {
                    if (!this._closed) this.cb.onData(`\x1b[31m${data.toString('utf8')}\x1b[0m`);
                });
                stream.once('close', () => this._close('Stream closed'));
                stream.once('end', () => this._close('Stream ended'));
                this.cb.onReady();
            });
        });

        this.conn.on('error', (err) => {
            const msg = err.message || 'Unknown connection error';
            const display = msg.includes('authentication methods failed')
                ? 'Authentication failed (check password/server config)'
                : `Connect Error: ${msg}`;
            logger.error(`SSH error for ${host}: ${msg}`);
            this.cb.onError(display);
            this._close('Connection error');
        });

        this.conn.on('end', () => this._close('Connection ended'));

        this.conn.connect({
            host, port, username: user, password,
            tryKeyboard: true, readyTimeout: 20000, keepaliveInterval: 15000
        });
    }

    write(data) {
        if (this.stream?.writable) this.stream.write(data);
    }

    resize(cols, rows) {
        if (this.stream) {
            this.stream.setWindow(rows, cols, (err) => {
                if (err) logger.warn(`Resize error: ${err.message}`);
            });
        }
    }

    disconnect() {
        this._close('disconnect');
    }

    _close(reason) {
        if (this._closed) return;
        this._closed = true;
        this.stream?.destroy();
        this.conn?.destroy();
        this.stream = null;
        this.conn = null;
        this.cb.onClose(reason);
    }
}

module.exports = SshClient;
