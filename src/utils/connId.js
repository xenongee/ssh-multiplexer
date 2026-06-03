'use strict';

function generateConnId(hc) {
    return `${hc.user}@${hc.host}:${hc.port}`;
}

function getDisplayHostString(hc) {
    return hc.label || `${hc.user}@${hc.host}`;
}

module.exports = { generateConnId, getDisplayHostString };
