'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/game.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

describe('index.html <-> app.js wiring', () => {
  test('every $(\'id\') used in app.js exists exactly once in index.html', () => {
    const ids = new Set([...app.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]));
    assert.ok(ids.size > 10);
    for (const id of ids) {
      const n = html.split(`id="${id}"`).length - 1;
      assert.equal(n, 1, `id "${id}" found ${n}x in index.html`);
    }
  });

  test('scripts are loaded in dependency order', () => {
    const order = ['js/game.js', 'js/storage.js', 'js/view.js', 'js/app.js'].map(s => html.indexOf(`src="${s}"`));
    assert.ok(order.every(i => i > -1), 'all scripts referenced');
    assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  });

  test('every preset button matches PRESET_NAMES', () => {
    const presets = [...html.matchAll(/class="chip preset-player" data-name="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(presets, [...G.PRESET_NAMES]);
  });

  test('all referenced death sounds exist on disk', () => {
    for (const file of G.DEATH_SOUNDS) {
      assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
    }
  });

  test('legacy script.js is no longer referenced', () => {
    assert.ok(!html.includes('src="script.js"'));
  });

  test('telemetry CLI is properly configured for auto-scroll', () => {
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    assert.ok(html.includes('id="cli-output"'), 'cli-output exists in HTML');
    assert.ok(app.includes('scrollCliToBottom'), 'app.js includes scrollCliToBottom');
    assert.ok(css.includes('.cli-line') && css.includes('flex-shrink: 0'), '.cli-line prevents flex squishing');
    assert.ok(css.includes('overflow-y: auto'), '.cli-body supports vertical scrolling');
  });
});

