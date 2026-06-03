'use strict';
const fs = require('fs');
const path = require('path');
const { generateConnId } = require('../utils/connId');

const APP_CONFIG_FILE = 'sshm.json';

const DEFAULT_CONFIG = {
    app_port: 3333,
    app_host: '127.0.0.1',
    terminal_defaults: { fontFamily: "monospace", fontSize: 12, minWidth: 800 },
    groups: [{
        group: "localhost_default",
        hosts: [{ label: "localhost", user: "user", host: "127.0.0.1", port: 22, password: "password" }]
    }]
};

function loadConfig(baseDir) {
    const configPath = path.join(baseDir, APP_CONFIG_FILE);
    console.log(`> Loading configuration from: ${configPath}...`);

    if (!fs.existsSync(configPath)) {
        console.warn(`> Configuration file not found. Creating default.`);
        try {
            fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
            console.log(`> Default configuration written to ${configPath}`);
        } catch (err) {
            console.error(`> ERROR writing default config:`, err.message);
        }
        return createService(DEFAULT_CONFIG);
    }

    try {
        const rawConfig = fs.readFileSync(configPath, 'utf8');
        const parsedConfig = JSON.parse(rawConfig);
        const config = {
            ...DEFAULT_CONFIG,
            ...parsedConfig,
            terminal_defaults: { ...DEFAULT_CONFIG.terminal_defaults, ...(parsedConfig.terminal_defaults || {}) },
            groups: Array.isArray(parsedConfig.groups) ? parsedConfig.groups : DEFAULT_CONFIG.groups
        };
        console.log(`> Configuration loaded successfully. Found ${config.groups.length} groups.`);
        return createService(config);
    } catch (err) {
        console.error(`> ERROR reading or parsing ${APP_CONFIG_FILE}:`, err.message);
        console.warn('> Using default configuration due to error.');
        return createService(DEFAULT_CONFIG);
    }
}

function createService(config) {
    return {
        getPort() { return config.app_port; },
        getHost() { return config.app_host; },
        getTerminalDefaults() { return config.terminal_defaults; },
        getGroupNames() { return config.groups.map(g => g.group); },

        getHostsByGroup(groupName) {
            const group = config.groups.find(g => g.group === groupName);
            return group ? group.hosts : null;
        },

        findHostByConnId(connId) {
            for (const group of config.groups) {
                for (const host of group.hosts) {
                    if (generateConnId(host) === connId) return host;
                }
            }
            return null;
        }
    };
}

module.exports = { loadConfig };
