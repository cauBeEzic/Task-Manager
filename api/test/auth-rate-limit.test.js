const assert = require('node:assert/strict');
const test = require('node:test');
const { clientIp, createAuthLimitKey } = require('../auth-rate-limit');

function request({ email, refreshToken, headers = {}, ip = '192.0.2.1' } = {}) {
    return {
        body: email ? { email } : {},
        cookies: refreshToken ? { refreshToken } : {},
        path: '/users/login',
        ip,
        header(name) {
            return headers[name.toLowerCase()];
        }
    };
}

test('keys auth limits by normalized identity so proxied users do not share one bucket', () => {
    const first = createAuthLimitKey(request({ email: 'First@Example.com' }));
    const same = createAuthLimitKey(request({ email: ' first@example.com ' }));
    const second = createAuthLimitKey(request({ email: 'second@example.com' }));

    assert.equal(first, same);
    assert.notEqual(first, second);
    assert.doesNotMatch(first, /first@example\.com/);
});

test('trusts a forwarded client address only when the proxy secret matches', () => {
    const req = request({
        headers: {
            'x-task-client-ip': '203.0.113.7',
            'x-task-proxy-secret': 'shared-secret'
        }
    });

    assert.equal(clientIp(req, 'wrong-secret'), '192.0.2.1');
    assert.equal(clientIp(req, 'shared-secret'), '203.0.113.7');
});
