'use strict';

const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { test, beforeEach, afterEach } = require('node:test');

const handlerPath = require.resolve('../api/contact.js');
const environmentKeys = ['RESEND_API_KEY', 'VERCEL', 'VERCEL_URL', 'VERCEL_BRANCH_URL'];
let savedEnvironment;

beforeEach(() => {
  savedEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
  process.env.RESEND_API_KEY = 'test-key-never-sent-to-a-network';
  process.env.VERCEL = '1';
  process.env.VERCEL_URL = 'bath-tampa-preview.vercel.app';
  process.env.VERCEL_BRANCH_URL = 'bath-tampa-branch.vercel.app';
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete require.cache[handlerPath];
});

function validBody(overrides = {}) {
  return {
    name: ' Test Customer ',
    email: ' customer@example.com ',
    phone: ' (813) 555-0123 ',
    zip_code: ' 33602 ',
    message: ' Please quote refinishing my bathtub. ',
    website: '',
    request_id: '38cb4d01-4f7a-4b88-9f6d-04f48b74e2d0',
    ...overrides,
  };
}

function setup(t, fetchImplementation = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ id: 'test-email-id' }),
})) {
  delete require.cache[handlerPath];
  const handler = require(handlerPath);
  const fetchMock = t.mock.method(global, 'fetch', fetchImplementation);
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'error', () => {});

  async function submit(options = {}) {
    const req = options.chunks ? Readable.from(options.chunks) : {};
    req.method = options.method || 'POST';
    req.headers = {
      origin: 'https://bath-professional.com',
      'content-type': 'application/json',
      accept: 'application/json',
      ...options.headers,
    };
    req.socket = { remoteAddress: options.ip || '192.0.2.10' };
    if (!options.chunks) req.body = Object.hasOwn(options, 'body') ? options.body : validBody();

    const res = {
      statusCode: 200,
      headers: {},
      text: '',
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      end(value) { this.text = value; },
    };
    await handler(req, res);
    if (res.headers['content-type']?.startsWith('application/json')) res.json = JSON.parse(res.text);
    return res;
  }

  return { submit, fetchMock };
}

function assertRejected(res, status, code, fetchMock) {
  assert.equal(res.statusCode, status);
  assert.equal(res.json.success, false);
  assert.equal(res.json.code, code);
  assert.equal(fetchMock.mock.callCount(), 0, 'rejected input must not reach the email provider');
}

test('sends trimmed customer details to the fixed business recipient with the correct site identity', async t => {
  const { submit, fetchMock } = setup(t);
  const res = await submit({ body: validBody({
    to: 'attacker@example.com',
    from: 'attacker@example.com',
    subject: 'Untrusted subject',
  }) });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json.success, true);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(fetchMock.mock.callCount(), 1);

  const [url, request] = fetchMock.mock.calls[0].arguments;
  const email = JSON.parse(request.body);
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.Authorization, `Bearer ${process.env.RESEND_API_KEY}`);
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.ok(request.signal instanceof AbortSignal);
  assert.equal(email.from, 'Bath Professional <website@bathprofessional.com>');
  assert.deepEqual(email.to, ['support@bathprofessional.com']);
  assert.equal(email.reply_to, 'customer@example.com');
  assert.equal(email.subject, 'New Contact Message — Bath Professional Tampa');
  assert.equal(email.text, [
    'New website inquiry from Bath Professional Tampa',
    'Website: https://bath-professional.com',
    '',
    'Name: Test Customer',
    'Email: customer@example.com',
    'Phone: (813) 555-0123',
    'ZIP code: 33602',
    '',
    'Message:',
    'Please quote refinishing my bathtub.',
  ].join('\n'));
});

const invalidFields = [
  ['missing name', { name: undefined }],
  ['empty message', { message: ' \t ' }],
  ['invalid email', { email: 'not-an-email' }],
  ['email header injection', { email: 'customer@example.com\nBcc: other@example.com' }],
  ['name header injection', { name: 'Name\r\nOther' }],
  ['short phone', { phone: '123' }],
  ['alphabetic phone', { phone: '813-555-ABCD' }],
  ['non-five-digit ZIP', { zip_code: '3360' }],
  ['nonnumeric ZIP', { zip_code: '33X02' }],
  ['array field', { email: ['customer@example.com'] }],
  ['name too long', { name: 'n'.repeat(121) }],
  ['message too long', { message: 'm'.repeat(5001) }],
  ['NUL in message', { message: 'message\u0000suffix' }],
  ['invalid request ID', { request_id: 'not-a-uuid' }],
  ['object request ID', { request_id: { value: 'bad' } }],
];

for (const [description, overrides] of invalidFields) {
  test(`validation rejects ${description} without sending email`, async t => {
    const { submit, fetchMock } = setup(t);
    assertRejected(await submit({ body: validBody(overrides) }), 400, 'VALIDATION_ERROR', fetchMock);
  });
}

for (const [description, options, status] of [
  ['body array', { body: [validBody()] }, 400],
  ['JSON body array', { body: JSON.stringify([validBody()]) }, 400],
  ['null JSON body', { body: 'null' }, 400],
  ['scalar JSON body', { body: '42' }, 400],
  ['malformed JSON', { body: '{invalid' }, 400],
  ['unsupported content type', { headers: { 'content-type': 'text/plain' } }, 415],
  ['oversized content-length', { headers: { 'content-length': '24577' } }, 413],
  ['oversized parsed body', { body: validBody({ extra: 'x'.repeat(24577) }) }, 413],
  ['oversized streamed body', { chunks: [Buffer.alloc(12000, 'x'), Buffer.alloc(13000, 'x')] }, 413],
]) {
  test(`rejects ${description} before contacting the email provider`, async t => {
    const { submit, fetchMock } = setup(t);
    assertRejected(await submit(options), status, 'INVALID_REQUEST', fetchMock);
  });
}

test('accepts JSON read from a request stream', async t => {
  const { submit, fetchMock } = setup(t);
  const body = JSON.stringify(validBody());
  const res = await submit({ chunks: [body.slice(0, 40), Buffer.from(body.slice(40))] });
  assert.equal(res.statusCode, 200);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('rejects third-party, missing, and production localhost origins', async t => {
  const { submit, fetchMock } = setup(t);
  for (const origin of ['https://evil.example', 'https://bath-professional.com.evil.example', 'null', undefined, 'http://localhost:8080']) {
    assertRejected(await submit({ headers: { origin } }), 403, 'ORIGIN_NOT_ALLOWED', fetchMock);
  }
});

test('accepts the www domain, verified deployment hosts, and same-site Referer fallback', async t => {
  const { submit, fetchMock } = setup(t);
  for (const headers of [
    { origin: 'https://www.bath-professional.com' },
    { origin: 'https://bath-tampa-preview.vercel.app' },
    { origin: 'https://bath-tampa-branch.vercel.app' },
    { origin: undefined, referer: 'https://bath-professional.com/contact?source=native' },
  ]) {
    assert.equal((await submit({ headers })).statusCode, 200);
  }
  assert.equal(fetchMock.mock.callCount(), 4);
});

test('a populated honeypot never sends or reports success', async t => {
  const { submit, fetchMock } = setup(t);
  assertRejected(await submit({ body: validBody({ website: 'https://spam.example' }) }), 400, 'INVALID_REQUEST', fetchMock);
});

test('missing provider configuration returns a useful 503 without sending', async t => {
  const { submit, fetchMock } = setup(t);
  delete process.env.RESEND_API_KEY;
  const res = await submit();
  assertRejected(res, 503, 'SERVICE_UNAVAILABLE', fetchMock);
  assert.match(res.json.message, /support@bathprofessional\.com/);
  assert.match(res.json.message, /\(813\) 445-9319/);
});

for (const [description, response] of [
  ['upstream HTTP 500', { ok: false, status: 500, json: async () => ({ id: 'unreliable-id' }) }],
  ['invalid upstream JSON', { ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON'); } }],
  ['missing email ID', { ok: true, status: 200, json: async () => ({}) }],
  ['empty email ID', { ok: true, status: 200, json: async () => ({ id: '' }) }],
  ['non-string email ID', { ok: true, status: 200, json: async () => ({ id: 123 }) }],
]) {
  test(`${description} cannot be reported as a successful send`, async t => {
    const { submit, fetchMock } = setup(t, async () => response);
    const res = await submit();
    assert.equal(res.statusCode, 502);
    assert.equal(res.json.success, false);
    assert.equal(res.json.code, 'DELIVERY_FAILED');
    assert.equal(fetchMock.mock.callCount(), 1);
  });
}

test('a provider network failure returns 502 without exposing the raw exception', async t => {
  const { submit } = setup(t, async () => { throw new TypeError('private upstream diagnostics'); });
  const res = await submit();
  assert.equal(res.statusCode, 502);
  assert.equal(res.json.success, false);
  assert.equal(res.json.code, 'DELIVERY_FAILED');
  assert.doesNotMatch(res.text, /private upstream diagnostics/);
});

test('an unresponsive provider is aborted after 12 seconds and returns 504', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { submit, fetchMock } = setup(t, (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = submit();
  await Promise.resolve();
  assert.equal(fetchMock.mock.callCount(), 1);
  const signal = fetchMock.mock.calls[0].arguments[1].signal;
  t.mock.timers.tick(11999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  const res = await pending;
  assert.equal(signal.aborted, true);
  assert.equal(res.statusCode, 504);
  assert.equal(res.json.success, false);
  assert.equal(res.json.code, 'DELIVERY_TIMEOUT');
});

test('native urlencoded submission sends email and returns an HTML confirmation', async t => {
  const { submit, fetchMock } = setup(t);
  const encoded = new URLSearchParams(validBody()).toString();
  const res = await submit({
    chunks: [Buffer.from(encoded)],
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', accept: 'text/html' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(res.text, /<h1>Message sent<\/h1>/);
  assert.match(res.text, /https:\/\/bath-professional\.com\/#contact/);
  assert.ok(res.headers['content-security-policy'].includes("frame-ancestors 'none'"));
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('GET returns 405 and advertises POST', async t => {
  const { submit, fetchMock } = setup(t);
  const res = await submit({ method: 'GET' });
  assertRejected(res, 405, 'METHOD_NOT_ALLOWED', fetchMock);
  assert.equal(res.headers.allow, 'POST');
});

test('retries propagate the same site-scoped provider idempotency key', async t => {
  const { submit, fetchMock } = setup(t);
  await submit();
  await submit();
  const keys = fetchMock.mock.calls.map(call => call.arguments[1].headers['Idempotency-Key']);
  assert.deepEqual(keys, [
    'contact-tampa-38cb4d01-4f7a-4b88-9f6d-04f48b74e2d0',
    'contact-tampa-38cb4d01-4f7a-4b88-9f6d-04f48b74e2d0',
  ]);
});

test('native submissions without a request ID receive a generated idempotency key', async t => {
  const { submit, fetchMock } = setup(t);
  await submit({ body: validBody({ request_id: undefined }) });
  const key = fetchMock.mock.calls[0].arguments[1].headers['Idempotency-Key'];
  assert.match(key, /^contact-tampa-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

test('best-effort rate limiting blocks the sixth attempt, isolates clients, and expires', async t => {
  const now = Date.UTC(2026, 8, 30);
  t.mock.timers.enable({ apis: ['Date'], now });
  const { submit, fetchMock } = setup(t);
  for (let i = 0; i < 5; i++) assert.equal((await submit()).statusCode, 200);
  const limited = await submit();
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json.success, false);
  assert.equal(limited.json.code, 'RATE_LIMITED');
  assert.equal(limited.headers['retry-after'], '600');
  assert.equal(fetchMock.mock.callCount(), 5);
  assert.equal((await submit({ ip: '192.0.2.11' })).statusCode, 200);
  t.mock.timers.setTime(now + 10 * 60 * 1000);
  assert.equal((await submit()).statusCode, 200);
  assert.equal(fetchMock.mock.callCount(), 7);
});

test('Vercel client IP takes precedence over an alternate forwarded header', async t => {
  const { submit, fetchMock } = setup(t);
  for (let i = 0; i < 5; i++) {
    const res = await submit({ headers: {
      'x-vercel-forwarded-for': '198.51.100.20',
      'x-forwarded-for': `203.0.113.${i + 1}`,
    } });
    assert.equal(res.statusCode, 200);
  }
  const res = await submit({ headers: {
    'x-vercel-forwarded-for': '198.51.100.20',
    'x-forwarded-for': '203.0.113.99',
  } });
  assert.equal(res.statusCode, 429);
  assert.equal(fetchMock.mock.callCount(), 5);
});
