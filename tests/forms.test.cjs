const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../js/forms.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const SUPPORT_PHONE = '(813) 445-9319';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INITIAL_VALUES = {
  name: 'Contact Form Test',
  email: 'test@example.com',
  phone: '8135550100',
  zip_code: '33602',
  message: 'Test message',
  website: '',
};

function response(data = { success: true }, ok = true) {
  return { ok, json: async () => data };
}

function harness({ fetchImpl = async () => response(), valid = true, crypto = webcrypto, readOnly = {} } = {}) {
  const fields = Object.fromEntries(Object.entries(INITIAL_VALUES).map(([name, value]) => [
    name, { value, readOnly: readOnly[name] || false },
  ]));
  const classes = new Set(['hidden']);
  const status = {
    textContent: '',
    classList: {
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      add(name) { classes.add(name); },
    },
  };
  const button = { disabled: false };
  const attributes = new Map();
  const timers = new Map();
  const requests = [];
  let listener;
  let resets = 0;
  let validations = 0;
  let timerSequence = 0;
  const form = {
    elements: { namedItem: (name) => fields[name] },
    reportValidity() { validations++; return valid; },
    addEventListener(event, callback) { if (event === 'submit') listener = callback; },
    reset() { resets++; Object.values(fields).forEach((field) => { field.value = ''; }); },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
  };
  vm.runInNewContext(source, {
    crypto,
    AbortController,
    document: { getElementById: (id) => ({
      contactForm: form, contactFormStatus: status, contactSubmitBtn: button,
    }[id]) },
    window: { location: { search: '?sent=1' } },
    fetch: async (url, options) => {
      requests.push({ url, options, payload: JSON.parse(options.body) });
      return fetchImpl(url, options, requests.length);
    },
    setTimeout(callback, delay) {
      const id = ++timerSequence;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    fields, status, button, classes, attributes, timers, requests,
    submit: () => listener({ preventDefault() {} }),
    restoreValues() {
      Object.entries(INITIAL_VALUES).forEach(([name, value]) => { fields[name].value = value; });
    },
    fireTimeout() {
      assert.equal(timers.size, 1);
      const timer = timers.values().next().value;
      assert.equal(timer.delay, 20000);
      timer.callback();
    },
    get resets() { return resets; },
    get validations() { return validations; },
  };
}

function assertRecovered(state) {
  assert.equal(state.button.disabled, false);
  assert.equal(state.attributes.has('aria-busy'), false);
  assert.equal(state.timers.size, 0);
}

function assertPreserved(state) {
  for (const [name, value] of Object.entries(INITIAL_VALUES)) {
    assert.equal(state.fields[name].value, value);
  }
  assert.equal(state.resets, 0);
}

test('uses native validation and native same-origin POST fallback', () => {
  const tag = html.match(/<form\b[^>]*id="contactForm"[^>]*>/)[0];
  assert.match(tag, /action="\/api\/contact"/);
  assert.match(tag, /method="post"/);
  assert.doesNotMatch(tag, /novalidate/);
  assert.match(html, /id="cfEmail"[^>]*type=|type="email"[^>]*id="cfEmail"/);
  assert.match(html, /id="cfZipCode"[^>]*pattern="\[0-9\]\{5\}"/);
});

test('a URL query parameter cannot claim a successful submission', () => {
  const state = harness();
  assert.equal(state.status.textContent, '');
  assert.equal(state.classes.has('success'), false);
  assert.equal(state.requests.length, 0);
});

test('native validation failure does not send or reset', async () => {
  const state = harness({ valid: false });
  await state.submit();
  assert.equal(state.validations, 1);
  assert.equal(state.requests.length, 0);
  assertPreserved(state);
  assertRecovered(state);
});

test('confirmed success sends JSON to this site and then clears the form', async () => {
  const state = harness();
  await state.submit();
  assert.equal(state.requests[0].url, '/api/contact');
  assert.equal(state.requests[0].options.method, 'POST');
  assert.equal(state.requests[0].options.credentials, 'same-origin');
  assert.equal(state.requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(
    Object.fromEntries(Object.entries(state.requests[0].payload).filter(([name]) => name !== 'request_id')),
    INITIAL_VALUES
  );
  assert.equal(state.resets, 1);
  assert.equal(state.classes.has('success'), true);
  assertRecovered(state);
});

for (const [name, fetchImpl] of [
  ['HTTP failure even with a success body', async () => response({ success: true }, false)],
  ['rejected submission', async () => response({ success: false, message: 'Please check your email address.' })],
  ['string success instead of boolean confirmation', async () => response({ success: 'true' })],
  ['invalid JSON', async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } })],
  ['network failure', async () => { throw new TypeError('Failed to fetch'); }],
]) {
  test(name + ' preserves customer input and restores controls', async () => {
    const state = harness({ fetchImpl });
    await state.submit();
    assert.equal(state.classes.has('error'), true);
    assertPreserved(state);
    assertRecovered(state);
  });
}

test('network failures display the site phone instead of a raw fetch error', async () => {
  const state = harness({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await state.submit();
  assert.ok(state.status.textContent.includes(SUPPORT_PHONE));
  assert.doesNotMatch(state.status.textContent, /Failed to fetch/);
});

test('an unchanged retry reuses its ID; changed content and confirmed success reset it', async () => {
  let succeed = false;
  const state = harness({
    fetchImpl: async () => {
      if (!succeed) throw new TypeError('Failed to fetch');
      return response();
    },
  });
  await state.submit();
  await state.submit();
  const first = state.requests[0].payload.request_id;
  assert.match(first, UUID_V4);
  assert.equal(state.requests[1].payload.request_id, first);
  state.fields.message.value = 'Changed message';
  await state.submit();
  const changed = state.requests[2].payload.request_id;
  assert.notEqual(changed, first);
  succeed = true;
  await state.submit();
  assert.equal(state.requests[3].payload.request_id, changed);
  state.restoreValues();
  state.fields.message.value = 'Changed message';
  await state.submit();
  assert.notEqual(state.requests[4].payload.request_id, changed);
});

test('secure random-byte fallback creates a UUIDv4', async () => {
  const state = harness({ crypto: { getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) } });
  await state.submit();
  assert.match(state.requests[0].payload.request_id, UUID_V4);
});

test('absence of secure randomness omits the optional request ID', async () => {
  const state = harness({ crypto: null });
  await state.submit();
  assert.equal(Object.hasOwn(state.requests[0].payload, 'request_id'), false);
  assert.equal(state.classes.has('success'), true);
});

for (const succeeds of [true, false]) {
  test('fields remain read-only while pending and restore previous state after ' + (succeeds ? 'success' : 'failure'), async () => {
    let finish;
    const state = harness({
      readOnly: { email: true },
      fetchImpl: () => new Promise((resolve, reject) => {
        finish = () => succeeds ? resolve(response()) : reject(new TypeError('Failed to fetch'));
      }),
    });
    const pending = state.submit();
    for (const field of Object.values(state.fields)) assert.equal(field.readOnly, true);
    assert.equal(state.button.disabled, true);
    assert.equal(state.attributes.get('aria-busy'), 'true');
    await state.submit();
    assert.equal(state.requests.length, 1, 'duplicate submit must not send again');
    finish();
    await pending;
    for (const [name, field] of Object.entries(state.fields)) assert.equal(field.readOnly, name === 'email');
    if (succeeds) {
      assert.equal(state.resets, 1);
      for (const field of Object.values(state.fields)) assert.equal(field.value, '');
    } else {
      assertPreserved(state);
    }
    assertRecovered(state);
  });
}

test('request timeout restores controls, preserves data, and retains the retry ID', async () => {
  const state = harness({
    fetchImpl: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });
  const pending = state.submit();
  state.fireTimeout();
  await pending;
  assert.match(state.status.textContent, /took too long/);
  assert.ok(state.status.textContent.includes(SUPPORT_PHONE));
  assertPreserved(state);
  assertRecovered(state);
  const retry = state.submit();
  assert.equal(state.requests[1].payload.request_id, state.requests[0].payload.request_id);
  state.fireTimeout();
  await retry;
  assertPreserved(state);
  assertRecovered(state);
});
