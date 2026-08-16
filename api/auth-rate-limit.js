const { createHash, timingSafeEqual } = require('crypto');
const { ipKeyGenerator } = require('express-rate-limit');

function secretsMatch(actual, expected) {
    if (!actual || !expected) {
        return false;
    }
    const actualBuffer = Buffer.from(String(actual));
    const expectedBuffer = Buffer.from(String(expected));
    return actualBuffer.length === expectedBuffer.length
        && timingSafeEqual(actualBuffer, expectedBuffer);
}

function clientIp(req, proxySecret = process.env.PROXY_SHARED_SECRET) {
    if (secretsMatch(req.header('x-task-proxy-secret'), proxySecret)) {
        return req.header('x-task-client-ip') || req.ip;
    }
    return req.ip;
}

function identity(req) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (email) {
        return `email:${email}`;
    }
    if (req.cookies?.refreshToken) {
        return `session:${req.cookies.refreshToken}`;
    }
    return 'anonymous';
}

function digest(value) {
    return createHash('sha256').update(value).digest('hex');
}

function createAuthLimitKey(req) {
    const address = ipKeyGenerator(clientIp(req));
    return `${req.path}:${address}:${digest(identity(req))}`;
}

module.exports = { clientIp, createAuthLimitKey };
