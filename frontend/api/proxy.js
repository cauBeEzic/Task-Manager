const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'user-agent',
  'x-access-token',
  'x-idempotency-key',
  'x-xsrf-token'
];

const BLOCKED_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'set-cookie',
  'transfer-encoding'
]);

function getBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.body === undefined) {
    return undefined;
  }
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
    return req.body;
  }
  return JSON.stringify(req.body);
}

function getUpstreamUrl(req, apiOrigin) {
  const rawPath = Array.isArray(req.query.path) ? req.query.path : [req.query.path || ''];
  const segments = rawPath.flatMap((part) => String(part).split('/')).filter(Boolean);
  const upstream = new URL(`/${segments.map(encodeURIComponent).join('/')}`, apiOrigin);
  Object.entries(req.query)
    .filter(([key]) => key !== 'path')
    .forEach(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((entry) => upstream.searchParams.append(key, String(entry)));
    });
  return upstream;
}

module.exports = async function proxy(req, res) {
  res.setHeader('cache-control', 'no-store');
  const apiOrigin = process.env.API_ORIGIN;
  if (!apiOrigin) {
    return res.status(500).json({ error: 'API_ORIGIN is not configured' });
  }

  try {
    const headers = new Headers();
    FORWARDED_REQUEST_HEADERS.forEach((name) => {
      if (req.headers[name]) {
        headers.set(name, req.headers[name]);
      }
    });
    const clientIp = req.headers['x-vercel-forwarded-for']
      || req.headers['x-forwarded-for']
      || req.headers['x-real-ip'];
    if (clientIp && process.env.PROXY_SHARED_SECRET) {
      headers.set('x-task-client-ip', String(clientIp).split(',')[0].trim());
      headers.set('x-task-proxy-secret', process.env.PROXY_SHARED_SECRET);
    }

    const response = await fetch(getUpstreamUrl(req, apiOrigin), {
      method: req.method,
      headers,
      body: getBody(req),
      redirect: 'manual'
    });

    response.headers.forEach((value, name) => {
      if (!BLOCKED_RESPONSE_HEADERS.has(name)) {
        res.setHeader(name, value);
      }
    });
    const cookies = response.headers.getSetCookie?.() || [];
    if (cookies.length) {
      res.setHeader('set-cookie', cookies);
    }
    return res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('API proxy failed', error);
    return res.status(502).json({ error: 'API is unavailable' });
  }
};

module.exports.getUpstreamUrl = getUpstreamUrl;
