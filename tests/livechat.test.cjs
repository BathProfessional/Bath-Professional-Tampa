const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of ['index.html', 'privacy-policy.html']) {
  test(file + ': loads the requested LiveChat account once, asynchronously', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const embeds = [...html.matchAll(/<!-- Start of LiveChat[\s\S]*?<!-- End of LiveChat code -->/g)];
    assert.equal(embeds.length, 1);
    const script = embeds[0][0].match(/<script>([\s\S]*?)<\/script>/)[1];
    const scripts = [];
    const window = {};
    const document = {
      createElement(tag) { assert.equal(tag, 'script'); return {}; },
      head: { appendChild(script) { scripts.push(script); } }
    };
    vm.runInNewContext(script, { window, document });
    assert.equal(window.__lc.license, 19950213);
    assert.equal(window.__lc.integration_name, 'manual_channels');
    assert.equal(window.__lc.product_name, 'livechat');
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, 'https://cdn.livechatinc.com/tracking.js');
    assert.equal(scripts[0].async, true);
    assert.equal(typeof window.LiveChatWidget.call, 'function');
    assert.match(embeds[0][0], /href="https:\/\/www\.livechat\.com\/chat-with\/19950213\/"/);
    assert.doesNotMatch(html, /19896439|manual_onboarding|bootLiveChat/);
  });
}
