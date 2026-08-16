const assert = require('node:assert/strict');
const test = require('node:test');
const proxy = require('./proxy');
const { getUpstreamUrl } = proxy;

test('builds an upstream URL without leaking the internal path parameter', () => {
  const url = getUpstreamUrl({
    query: {
      path: ['lists', 'list id', 'tasks'],
      completed: 'false',
      tag: ['urgent', 'field']
    }
  }, 'https://task-api.example.com/base');

  assert.equal(
    url.toString(),
    'https://task-api.example.com/lists/list%20id/tasks?completed=false&tag=urgent&tag=field'
  );
});

test('preserves slash-separated rewrite paths', () => {
  const url = getUpstreamUrl({ query: { path: 'lists/list-1/tasks' } }, 'https://task-api.example.com');
  assert.equal(url.toString(), 'https://task-api.example.com/lists/list-1/tasks');
});

test('forwards auth data and returns upstream cookies without forwarding the browser origin', async () => {
  const originalFetch = global.fetch;
  const originalApiOrigin = process.env.API_ORIGIN;
  const originalProxySecret = process.env.PROXY_SHARED_SECRET;
  let request;
  process.env.API_ORIGIN = 'https://task-api.example.com';
  process.env.PROXY_SHARED_SECRET = 'shared-secret';
  global.fetch = async (url, init) => {
    request = { url: url.toString(), init };
    const responseHeaders = new Headers({
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'x-access-token': 'access-token'
    });
    responseHeaders.append('set-cookie', 'refreshToken=secret; HttpOnly; Secure; Path=/');
    responseHeaders.append('set-cookie', 'XSRF-TOKEN=csrf; Secure; Path=/');
    return new Response(JSON.stringify({ _id: 'user-1' }), {
      status: 201,
      headers: responseHeaders
    });
  };

  const response = {
    headers: {},
    statusCode: 0,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; }
  };

  try {
    await proxy({
      method: 'POST',
      query: { path: 'users/login' },
      headers: {
        'content-type': 'application/json',
        'cookie': 'XSRF-TOKEN=csrf',
        'origin': 'https://preview.example.com',
        'x-vercel-forwarded-for': '203.0.113.7',
        'x-xsrf-token': 'csrf'
      },
      body: { email: 'field@example.com', password: 'password' }
    }, response);

    assert.equal(request.url, 'https://task-api.example.com/users/login');
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.headers.get('origin'), null);
    assert.equal(request.init.headers.get('cookie'), 'XSRF-TOKEN=csrf');
    assert.equal(request.init.headers.get('x-task-client-ip'), '203.0.113.7');
    assert.equal(request.init.headers.get('x-task-proxy-secret'), 'shared-secret');
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.headers['set-cookie'], [
      'refreshToken=secret; HttpOnly; Secure; Path=/',
      'XSRF-TOKEN=csrf; Secure; Path=/'
    ]);
    assert.equal(response.headers['content-encoding'], undefined);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    global.fetch = originalFetch;
    if (originalApiOrigin === undefined) {
      delete process.env.API_ORIGIN;
    } else {
      process.env.API_ORIGIN = originalApiOrigin;
    }
    if (originalProxySecret === undefined) {
      delete process.env.PROXY_SHARED_SECRET;
    } else {
      process.env.PROXY_SHARED_SECRET = originalProxySecret;
    }
  }
});
