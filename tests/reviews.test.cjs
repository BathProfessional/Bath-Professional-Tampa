'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/google-reviews.js'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/google-reviews.json'), 'utf8'));

async function render({ count = 444, failure } = {}) {
  const summary = { innerHTML: '' };
  const classes = new Set();
  const listeners = new Map();
  const timers = new Map();
  const requests = [];
  const warnings = [];
  let timerId = 0;
  const track = {
    children: [],
    parentElement: { clientWidth: 1200 },
    get innerHTML() { return ''; },
    set innerHTML(value) { this.children = []; },
    get scrollWidth() { return this.children.length * 364; },
    offsetWidth: 1200,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
    style: { setProperty() {} },
    appendChild(card) {
      card.offsetLeft = this.children.length * 364;
      this.children.push(card);
    },
    querySelectorAll() { return this.children; },
    closest() { return {}; },
  };
  const window = {
    innerWidth: 1200,
    addEventListener(name, listener) { listeners.set(name, listener); },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
  };
  vm.runInNewContext(source, {
    window,
    document: {
      getElementById: (id) => ({
        googleReviewTrack: track,
        googleReviewSummary: summary,
      }[id]),
      createElement: () => ({ classList: { add() {} }, innerHTML: '' }),
    },
    console: { warn: (...args) => warnings.push(args) },
    clearTimeout: (id) => timers.delete(id),
    fetch: async (url) => {
      requests.push(url);
      if (failure === 'network') throw new Error('Network unavailable');
      return {
        ok: failure !== 'http',
        status: failure === 'http' ? 503 : 200,
        json: async () => ({ ...structuredClone(fixture), reviewCount: count }),
      };
    },
  });
  // Let the real fetch/json promise chain and its fallback finish.
  await new Promise(setImmediate);
  return {
    summary, track, classes, requests, warnings,
    resize() {
      listeners.get('resize')();
      for (const callback of timers.values()) callback();
      timers.clear();
    },
  };
}

function assertBanner(html, count) {
  assert.match(html, /class="google-summary-rating"/);
  assert.match(html, /class="google-summary-score"[^>]*>\s*5\.0\s*</);
  assert.match(html, /\/5/);
  assert.match(html, new RegExp('class="google-summary-count"[^>]*>[\\s\\S]*?<strong[^>]*>\\s*' + count + '\\s*</strong>'));
  assert.doesNotMatch(html, /<(?:button|a)\b/i);
  assert.doesNotMatch(html, /google-summary-actions|Read All Reviews|Write a Review/);
}

test('JSON success renders the 5.0 / 444 summary without action buttons and preserves the marquee', async () => {
  const app = await render();
  assertBanner(app.summary.innerHTML, 444);
  assert.deepEqual(app.requests, ['data/google-reviews.json?v=r444']);
  assert.equal(app.warnings.length, 0);
  assert.ok(app.classes.has('is-ready'));
  assert.ok(app.track.children.length >= fixture.reviews.length * 2);
  assert.ok(app.track.children.some((card) => card.innerHTML.includes(fixture.reviews[0].text)));
});

for (const failure of ['network', 'http']) {
  test(failure + ' failure renders the embedded 444-review fallback without action buttons', async () => {
    const app = await render({ failure });
    assertBanner(app.summary.innerHTML, 444);
    assert.equal(app.warnings.length, 1);
    assert.ok(app.classes.has('is-ready'));
    assert.ok(app.track.children.length > 0);
  });
}

test('older JSON totals cannot reduce the summary below 444', async () => {
  const app = await render({ count: 440 });
  assertBanner(app.summary.innerHTML, 444);
  assert.equal(app.warnings.length, 0);
});

test('newer JSON totals remain visible instead of being replaced by the fallback total', async () => {
  const app = await render({ count: 450 });
  assertBanner(app.summary.innerHTML, 450);
  assert.equal(app.warnings.length, 0);
});

test('resize rebuilds the cached summary and marquee without restoring the removed buttons', async () => {
  const app = await render();
  const originalSummary = app.summary.innerHTML;
  const originalCards = app.track.children.length;
  app.resize();
  assertBanner(app.summary.innerHTML, 444);
  assert.equal(app.summary.innerHTML, originalSummary);
  assert.equal(app.track.children.length, originalCards);
  assert.equal(app.requests.length, 1);
  assert.ok(app.classes.has('is-ready'));
});

