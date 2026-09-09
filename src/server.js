'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { loadConfig } = require('./config/ConfigService');
const SessionManager = require('./ssh/SessionManager');
const SocketController = require('./socket/SocketController');

const baseDir = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
const configService = loadConfig(baseDir);
const appVersion = require('../package.json').version;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const vendor = (pkg, sub = '') =>
    express.static(path.join(__dirname, '..', 'node_modules', pkg, sub));
app.use('/vendor/socket.io', vendor('socket.io-client', 'dist'));
app.use('/vendor/xterm/css', vendor('@xterm/xterm', 'css'));
app.use('/vendor/xterm/lib', vendor('@xterm/xterm', 'lib'));
app.use('/vendor/xterm-addon-fit/lib', vendor('@xterm/addon-fit', 'lib'));
app.get('/api/version', (req, res) => res.json({ version: appVersion }));
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new SessionManager();
new SocketController(io, sessions, configService).initialize();

server.listen(configService.getPort(), configService.getHost(), () => {
    console.log(`\n> SSH Multiplexer started.`);
    console.log(`> Listening: http://${configService.getHost()}:${configService.getPort()}`);
});

process.on('SIGINT', () => {
    console.log('\n> Shutting down...');
    sessions.destroyAll();
    io.close(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(1), 5000);
});
