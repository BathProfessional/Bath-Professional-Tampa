'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/google-reviews.js'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/google-reviews.json'), 'utf8'));
const CARD_STRIDE = 364;

async function render({ count = 444, failure, width = 1200, useResizeObserver = true } = {}) {
  let summaryHtml = '';
  let summaryWrites = 0;
  let trackClears = 0;
  const summary = {
    get innerHTML() { return summaryHtml; },
    set innerHTML(value) { summaryHtml = value; summaryWrites += 1; },
  };
  const classes = new Set();
  const styleProperties = new Map();
  const listeners = new Map();
  const timers = new Map();
  const requests = [];
  const warnings = [];
  const intersectionObservers = [];
  const resizeObservers = [];
  const reviewsSection = {};
  const trackWrap = { clientWidth: width };
  let timerId = 0;

  const track = {
    children: [],
    parentElement: trackWrap,
    get innerHTML() { return ''; },
    set innerHTML(value) { this.children = []; trackClears += 1; },
    get scrollWidth() { throw new Error('buildMarquee must not alternate scrollWidth reads with writes'); },
    get offsetWidth() { throw new Error('buildMarquee must not force an extra offsetWidth read'); },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
    style: {
      setProperty(name, value) { styleProperties.set(name, value); },
    },
    appendChild(node) {
      const nodes = node.isFragment ? node.children.splice(0) : [node];
      nodes.forEach((child) => {
        child.offsetLeft = this.children.length * CARD_STRIDE;
        this.children.push(child);
      });
      return node;
    },
    closest() { return reviewsSection; },
  };

  class IntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      intersectionObservers.push(this);
    }
    observe(target) { this.observed.push(target); }
    disconnect() { this.disconnected = true; }
    trigger(isIntersecting) { this.callback([{ isIntersecting }]); }
  }

  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      resizeObservers.push(this);
    }
    observe(target) { this.observed.push(target); }
    trigger(contentWidth, contentHeight = 300) {
      this.callback([{ contentRect: { width: contentWidth, height: contentHeight } }]);
    }
  }

  const window = {
    innerWidth: width,
    IntersectionObserver,
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
  };
  if (useResizeObserver) window.ResizeObserver = ResizeObserver;

  function flushTimers() {
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
  }

  vm.runInNewContext(source, {
    window,
    document: {
      getElementById: (id) => ({
        googleReviewTrack: track,
        googleReviewSummary: summary,
      }[id]),
      createElement: () => ({ classList: { add() {} }, innerHTML: '' }),
      createDocumentFragment: () => ({
        isFragment: true,
        children: [],
        appendChild(node) { this.children.push(node); return node; },
      }),
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
    summary,
    track,
    classes,
    styleProperties,
    requests,
    warnings,
    intersectionObservers,
    resizeObservers,
    get summaryWrites() { return summaryWrites; },
    get trackClears() { return trackClears; },
    resize({ width: nextWidth = trackWrap.clientWidth, height = 300 } = {}) {
      trackWrap.clientWidth = nextWidth;
      window.innerWidth = nextWidth;
      if (useResizeObserver) {
        resizeObservers[0].trigger(nextWidth, height);
      } else {
        for (const listener of listeners.get('resize') || []) listener();
      }
      flushTimers();
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

test('JSON success preserves summary, review order, exact distance and 40px/s duration', async () => {
  const app = await render();
  assertBanner(app.summary.innerHTML, 444);
  assert.deepEqual(app.requests, ['data/google-reviews.json?v=r444']);
  assert.equal(app.warnings.length, 0);
  assert.ok(app.classes.has('is-ready'));
  assert.equal(app.track.children.length, fixture.reviews.length * 2);
  assert.equal(app.styleProperties.get('--review-scroll-distance'), '1820px');
  assert.equal(app.styleProperties.get('--review-scroll-duration'), '46s');
  for (let index = 0; index < fixture.reviews.length; index += 1) {
    assert.match(app.track.children[index].innerHTML, new RegExp(fixture.reviews[index].author));
    assert.equal(app.track.children[index].innerHTML, app.track.children[index + fixture.reviews.length].innerHTML);
  }
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

test('very wide viewports retain a hard ten-set clone cap', async () => {
  const app = await render({ width: 100000 });
  assert.equal(app.track.children.length, fixture.reviews.length * 10);
  assert.ok(app.classes.has('is-ready'));
});

test('height-only ResizeObserver events do not rebuild the track or summary', async () => {
  const app = await render();
  const originalSummary = app.summary.innerHTML;
  const originalClears = app.trackClears;
  const originalWrites = app.summaryWrites;
  app.resize({ height: 900 });
  assert.equal(app.trackClears, originalClears);
  assert.equal(app.summaryWrites, originalWrites);
  assert.equal(app.summary.innerHTML, originalSummary);
});

test('width changes rebuild only the marquee and keep one IntersectionObserver for life', async () => {
  const app = await render();
  const originalSummary = app.summary.innerHTML;
  const originalWrites = app.summaryWrites;
  const originalClears = app.trackClears;
  assert.equal(app.intersectionObservers.length, 1);
  assert.equal(app.intersectionObservers[0].observed.length, 1);

  app.resize({ width: 4200 });
  app.resize({ width: 4300 });

  assert.ok(app.trackClears > originalClears);
  assert.equal(app.summaryWrites, originalWrites);
  assert.equal(app.summary.innerHTML, originalSummary);
  assert.equal(app.intersectionObservers.length, 1);
  assert.equal(app.intersectionObservers[0].disconnected, undefined);
  assert.equal(app.requests.length, 1);
});

test('visibility observer uses the CSS variable so hover can remain authoritative', async () => {
  const app = await render();
  app.intersectionObservers[0].trigger(false);
  assert.equal(app.styleProperties.get('--review-visibility-state'), 'paused');
  app.intersectionObservers[0].trigger(true);
  assert.equal(app.styleProperties.get('--review-visibility-state'), 'running');
});

test('window resize fallback checks width before rebuilding', async () => {
  const app = await render({ useResizeObserver: false });
  const originalClears = app.trackClears;
  const originalWrites = app.summaryWrites;
  app.resize({ height: 900 });
  assert.equal(app.trackClears, originalClears);
  app.resize({ width: 4200 });
  assert.ok(app.trackClears > originalClears);
  assert.equal(app.summaryWrites, originalWrites);
});

