'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    emit(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
  };
}

function element(initialClasses = []) {
  const classes = new Set(initialClasses);
  return {
    ...eventTarget(),
    attributes: new Map(),
    style: { setProperty() {} },
    classList: {
      contains: (name) => classes.has(name),
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force) {
        const active = force === undefined ? !classes.has(name) : force;
        if (active) classes.add(name);
        else classes.delete(name);
        return active;
      },
    },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
  };
}

function setup({ particles = false, hidden = false, menuOpen = false, delayedLenis = false } = {}) {
  const frames = new Map();
  const observers = [];
  const tweens = [];
  const lenisInstances = [];
  const scripts = [];
  const rect = { width: 1200, height: 720, left: 0, top: 0 };
  const counters = { transforms: 0, draws: 0, pauses: 0, resumes: 0, refreshes: 0 };
  let frameId = 0;

  const hero = element();
  hero.getBoundingClientRect = () => ({ ...rect });
  const canvasContext = {
    setTransform() { counters.transforms++; },
    clearRect() {},
    drawImage() { counters.draws++; },
  };
  const canvas = element();
  canvas.getContext = () => canvasContext;
  canvas.getBoundingClientRect = () => ({ ...rect });
  const spriteContext = {
    scale() {}, beginPath() {}, arc() {}, fill() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  const preview = element();
  const colorName = element();
  const colorCode = element();
  const colors = [
    { color: 'Pure White', code: 'Standard', swatch: '#FFFFFF' },
    { color: 'Bone', code: 'Standard', swatch: '#E2D0B5' },
  ];
  const swatches = colors.map((dataset) => Object.assign(element(), { dataset }));
  const chips = colors.map((dataset) => Object.assign(element(), { dataset }));
  const modals = [element(['open']), element(['open'])];
  const menuToggle = element();
  const mobileMenu = element();
  const document = {
    ...eventTarget(),
    hidden,
    body: element(menuOpen ? ['menu-open'] : []),
    head: { appendChild: (script) => scripts.push(script) },
    getElementById: (id) => ({
      hero,
      header: element(),
      particleCanvas: particles ? canvas : null,
      colorName, colorCode, menuToggle, mobileMenu,
    }[id] || null),
    querySelector: (selector) => ({
      '.compare-wrap': element(),
      '.color-preview-surface': preview,
    }[selector] || null),
    querySelectorAll: (selector) => ({
      '.color-swatch': swatches,
      '.color-chip': chips,
      '.video-modal.open, .lightbox.open': modals.filter((modal) => modal.classList.contains('open')),
    }[selector] || []),
    createElement: (tag) => tag === 'canvas' ? { getContext: () => spriteContext } : element(),
  };
  class Lenis {
    constructor(options) {
      this.options = options;
      this.stops = 0;
      this.starts = 0;
      lenisInstances.push(this);
    }
    on() {}
    raf() {}
    stop() { this.stops++; }
    start() { this.starts++; }
  }
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() {}
  }
  const window = {
    ...eventTarget(),
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 1,
    matchMedia: (query) => ({
      matches: query === '(pointer: fine)' || (query === '(prefers-reduced-motion: reduce)' && !particles),
    }),
    IntersectionObserver,
    ...(delayedLenis ? {} : { Lenis }),
  };
  const gsap = {
    registerPlugin() {},
    ticker: { add() {}, lagSmoothing() {} },
    utils: { toArray: () => [] },
    to(target, options) { tweens.push({ method: 'to', target, options }); },
    from(target, options) { tweens.push({ method: 'from', target, options }); },
    fromTo(target, from, options) { tweens.push({ method: 'fromTo', target, from, options }); },
    globalTimeline: {
      pause() { counters.pauses++; },
      resume() { counters.resumes++; },
    },
  };
  vm.runInNewContext(source, {
    document, window, gsap, IntersectionObserver,
    ScrollTrigger: { create() {}, update() {}, refresh() { counters.refreshes++; } },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  return {
    document, window, canvas, rect, counters, frames, observers, tweens, lenisInstances,
    preview, colorName, colorCode, swatches, chips, modals, menuToggle, mobileMenu,
    flushFrame(time = 100) {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(time);
    },
    finishLenisLoad() {
      window.Lenis = Lenis;
      scripts[0].onload();
    },
  };
}

test('menu state stops and restarts Lenis without installing a duplicate menu click listener', () => {
  const app = setup();
  const lenis = app.lenisInstances[0];
  app.document.emit('bath:menu-change', { detail: { open: true } });
  assert.equal(lenis.stops, 1);
  app.document.emit('bath:menu-change', { detail: { open: false } });
  assert.equal(lenis.starts, 1);
  assert.equal(app.menuToggle.listeners.has('click'), false);
});

test('Lenis loaded after the menu opens starts stopped and initializes only once', () => {
  const app = setup({ delayedLenis: true });
  app.document.body.classList.add('menu-open');
  app.document.emit('bath:menu-change', { detail: { open: true } });
  app.finishLenisLoad();
  assert.equal(app.lenisInstances.length, 1);
  assert.equal(app.lenisInstances[0].stops, 1);
  app.finishLenisLoad();
  assert.equal(app.lenisInstances.length, 1);
});

test('particle resize events coalesce and unchanged dimensions do not rebuild the canvas', () => {
  const app = setup({ particles: true });
  assert.equal(app.counters.transforms, 1);
  assert.equal(app.frames.size, 1);
  for (let i = 0; i < 5; i++) app.window.emit('resize');
  assert.equal(app.frames.size, 2);
  app.flushFrame();
  assert.equal(app.counters.transforms, 1);

  app.rect.width = 1000;
  for (let i = 0; i < 5; i++) app.window.emit('resize');
  assert.equal(app.frames.size, 2);
  app.flushFrame(200);
  assert.equal(app.counters.transforms, 2);
  assert.equal(app.canvas.width, 1000);
  assert.equal(app.canvas.style.width, '1000px');
});

test('pixel-ratio changes resize the particle canvas even when its CSS dimensions are unchanged', () => {
  const app = setup({ particles: true });
  app.window.devicePixelRatio = 2;
  app.window.emit('resize');
  app.flushFrame();
  assert.equal(app.counters.transforms, 2);
  assert.equal(app.canvas.width, 1800);
  assert.equal(app.canvas.height, 1080);
});

test('hidden tabs cancel particle work and visible tabs resume exactly one loop', () => {
  const app = setup({ particles: true });
  app.document.hidden = true;
  app.document.emit('visibilitychange');
  assert.equal(app.frames.size, 0);
  assert.equal(app.counters.pauses, 1);
  app.document.hidden = false;
  app.document.emit('visibilitychange');
  app.document.emit('visibilitychange');
  assert.equal(app.frames.size, 1);
  app.flushFrame();
  assert.equal(app.counters.draws, 24);
  assert.equal(app.frames.size, 1);
});

test('particles do not start in a hidden tab or resume while the hero remains offscreen', () => {
  const app = setup({ particles: true, hidden: true });
  assert.equal(app.frames.size, 0);
  const observer = app.observers.find((item) => item.target === app.document.getElementById('hero'));
  observer.callback([{ isIntersecting: false }]);
  app.document.hidden = false;
  app.document.emit('visibilitychange');
  assert.equal(app.frames.size, 0);
  observer.callback([{ isIntersecting: true }]);
  assert.equal(app.frames.size, 1);
});

test('batched stat and comparison animations retain original element start times and durations', () => {
  const app = setup();
  const stats = app.tweens.filter((tween) => tween.target === '.stat-card');
  const rows = app.tweens.filter((tween) => tween.target === '.compare-table tbody tr');
  assert.equal(stats.length, 1);
  assert.equal(rows.length, 1);
  for (const [tween, base, interval, duration, trigger, start, ease] of [
    [stats[0], 0, 0.12, 0.6, '.stats-grid', 'top 75%', 'back.out(1.4)'],
    [rows[0], 0.15, 0.05, 0.4, '.compare-wrap', 'top 78%', 'power2.out'],
  ]) {
    const options = tween.options;
    assert.equal(options.duration, duration);
    assert.equal(options.ease, ease);
    assert.equal(options.scrollTrigger.trigger, trigger);
    assert.equal(options.scrollTrigger.start, start);
    assert.equal(options.scrollTrigger.once, true);
    for (let index = 0; index < 8; index++) {
      assert.equal((options.delay || 0) + index * options.stagger, base + index * interval);
    }
  }
  assert.equal(stats[0].options.opacity, 1);
  assert.equal(stats[0].options.y, 0);
  assert.equal(stats[0].options.scale, 1);
  assert.equal(rows[0].options.opacity, 0);
  assert.equal(rows[0].options.y, 14);
});

test('rapid color selections keep the requested color and always animate back to full size', () => {
  const app = setup();
  app.swatches[0].emit('click');
  app.chips[1].emit('click');
  app.chips[0].emit('click');
  const animations = app.tweens.filter((tween) => tween.target === app.preview);
  assert.equal(animations.length, 3);
  for (const animation of animations) {
    assert.equal(animation.method, 'fromTo');
    assert.equal(animation.from.scale, 0.9);
    assert.equal(animation.options.scale, 1);
    assert.equal(animation.options.duration, 0.4);
    assert.equal(animation.options.overwrite, 'auto');
  }
  assert.equal(app.colorName.textContent, 'Pure White');
  assert.equal(app.colorCode.textContent, 'Standard');
  assert.equal(app.preview.style.background, '#FFFFFF');
  for (const controls of [app.swatches, app.chips]) {
    assert.equal(controls[0].classList.contains('active'), true);
    assert.equal(controls[1].classList.contains('active'), false);
  }
});

test('Escape closes explicit modal elements without relying on window ID globals', () => {
  const app = setup();
  app.document.body.style.overflow = 'hidden';
  app.document.emit('keydown', { key: 'Tab' });
  assert.ok(app.modals.every((modal) => modal.classList.contains('open')));
  app.document.emit('keydown', { key: 'Escape' });
  for (const modal of app.modals) {
    assert.equal(modal.classList.contains('open'), false);
    assert.equal(modal.attributes.get('aria-hidden'), 'true');
  }
  assert.equal(app.document.body.style.overflow, '');
  assert.doesNotThrow(() => app.document.emit('keydown', { key: 'Escape' }));
});

