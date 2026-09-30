'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/mobile-menu.js'), 'utf8');

function element(initialClasses = []) {
  const classes = new Set(initialClasses);
  const attributes = new Map();
  const handlers = new Map();
  const focusCalls = [];
  return {
    attributes, handlers, focusCalls,
    classList: {
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        const active = force === undefined ? !classes.has(name) : force;
        if (active) classes.add(name);
        else classes.delete(name);
        return active;
      },
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    addEventListener(name, handler) { handlers.set(name, handler); },
    click() { handlers.get('click')?.(); },
    focus(options) { focusCalls.push(options); },
  };
}

function setup({ missingToggle = false, missingMenu = false } = {}) {
  const toggle = element(['active']);
  const menu = element(['open']);
  const body = element(['menu-open']);
  const root = element(['menu-open']);
  const links = [element(), element()];
  const handlers = new Map();
  const events = [];
  menu.querySelectorAll = (selector) => {
    assert.equal(selector, '.mobile-nav-link');
    return links;
  };
  vm.runInNewContext(source, {
    document: {
      body,
      documentElement: root,
      getElementById: (id) => ({
        menuToggle: missingToggle ? null : toggle,
        mobileMenu: missingMenu ? null : menu,
      }[id]),
      addEventListener(name, handler) { handlers.set(name, handler); },
      dispatchEvent(event) { events.push(event); },
    },
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    },
  });
  return {
    toggle, menu, body, root, links, events, handlers,
    key(key) {
      let prevented = false;
      handlers.get('keydown')?.({ key, preventDefault() { prevented = true; } });
      return prevented;
    },
  };
}

function assertState(app, open) {
  assert.equal(app.menu.classList.contains('open'), open);
  assert.equal(app.toggle.classList.contains('active'), open);
  assert.equal(app.body.classList.contains('menu-open'), open);
  assert.equal(app.root.classList.contains('menu-open'), open);
  assert.equal(app.menu.inert, !open);
  assert.equal(app.menu.attributes.get('aria-hidden'), String(!open));
  assert.equal(app.toggle.attributes.get('aria-expanded'), String(open));
  assert.equal(app.toggle.attributes.get('aria-label'), open ? 'Close menu' : 'Open menu');
  assert.equal(app.events.at(-1).type, 'bath:menu-change');
  assert.equal(app.events.at(-1).detail.open, open);
}

test('initialization closes the menu and synchronizes inert, ARIA, and CSS classes', () => {
  const app = setup();
  assertState(app, false);
  assert.equal(app.events.length, 1);
  assert.equal(app.toggle.focusCalls.length, 0);
});

test('opening the menu preserves focus and announces its state for scroll integration', () => {
  const app = setup();
  app.toggle.click();
  assertState(app, true);
  assert.equal(app.toggle.focusCalls.length, 0);
  assert.equal(app.events.length, 2);
});

test('a second toggle click closes the menu and removes both document scroll-lock classes', () => {
  const app = setup();
  app.toggle.click();
  app.toggle.click();
  assertState(app, false);
  assert.equal(app.toggle.focusCalls.length, 0);
});

test('every navigation link closes the menu and synchronizes its accessibility state', () => {
  const app = setup();
  for (const link of app.links) {
    app.toggle.click();
    assertState(app, true);
    link.click();
    assertState(app, false);
  }
});

test('Escape closes an open menu and returns focus without scrolling', () => {
  const app = setup();
  app.toggle.click();
  assert.equal(app.key('Escape'), true);
  assertState(app, false);
  assert.equal(app.toggle.focusCalls.length, 1);
  assert.equal(app.toggle.focusCalls[0].preventScroll, true);
});

test('Escape on a closed menu does not steal focus or prevent other keyboard handlers', () => {
  const app = setup();
  assert.equal(app.key('Escape'), false);
  assertState(app, false);
  assert.equal(app.toggle.focusCalls.length, 0);
  assert.equal(app.events.length, 1);
});

test('unrelated keys do not close an open menu', () => {
  const app = setup();
  app.toggle.click();
  assert.equal(app.key('Tab'), false);
  assertState(app, true);
  assert.equal(app.toggle.focusCalls.length, 0);
});

test('pages without either menu element skip initialization safely', () => {
  for (const missing of [{ missingToggle: true }, { missingMenu: true }]) {
    const app = setup(missing);
    assert.equal(app.handlers.size, 0);
    assert.equal(app.toggle.handlers.size, 0);
    assert.equal(app.events.length, 0);
  }
});

