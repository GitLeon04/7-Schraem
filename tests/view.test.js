'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const V = require('../js/view.js');

function must(r) { assert.equal(r.ok, true, r.error); return r.state; }
function gameWith(names, bet = 200) {
  let s = must(G.setBet(G.createInitialState(), bet));
  for (const n of names) s = must(G.addPlayer(s, n));
  return s;
}
const id = (s, n) => s.players.find(p => p.name === n).id;
const count = (html, needle) => html.split(needle).length - 1;

describe('escapeHtml', () => {
  test('escapes all dangerous characters', () => {
    assert.equal(V.escapeHtml(`<img src=x onerror="a('b')">&`),
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  });
  test('stringifies non-strings', () => {
    assert.equal(V.escapeHtml(5), '5');
    assert.equal(V.escapeHtml(null), '');
    assert.equal(V.escapeHtml(undefined), '');
  });
});

describe('renderPlayerCard', () => {
  test('REGRESSION: player names are HTML-escaped (no XSS)', () => {
    const s = gameWith(['<script>alert(1)</script>', 'B']);
    const html = V.renderPlayers(s);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('uses numeric ids in data attributes, never names', () => {
    const s = gameWith(['Tim"', 'B']);
    const html = V.renderPlayerCard(s.players[0], s);
    assert.ok(html.includes(`data-id="${s.players[0].id}"`));
    assert.ok(!html.includes('data-name'));
  });

  test('alive player has -1..-7 buttons and +1', () => {
    const s = gameWith(['A', 'B']);
    const html = V.renderPlayerCard(s.players[0], s);
    for (let i = 1; i <= G.MAX_LIVES; i++) {
      assert.ok(html.includes(`data-action="subtract" data-id="${s.players[0].id}" data-amount="${i}"`), `missing -${i}`);
    }
    assert.ok(html.includes('data-action="add"'));
    assert.ok(!html.includes('data-action="revive"'));
  });

  test('+1 is disabled at full lives', () => {
    const s = gameWith(['A', 'B']);
    const html = V.renderPlayerCard(s.players[0], s);
    assert.match(html, /data-action="add"[^>]*disabled/);
  });

  test('subtract buttons larger than remaining lives are still allowed (they eliminate)', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(G.subtractLife(s, id(s, 'A'), 5));
    const html = V.renderPlayerCard(G.getPlayer(s, id(s, 'A')), s);
    assert.doesNotMatch(html, /data-amount="7"[^>]*disabled/);
  });

  test('renders a pip per life showing remaining lives', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, id(s, 'A'), 3));
    const html = V.renderPlayerCard(G.getPlayer(s, id(s, 'A')), s);
    assert.equal(count(html, 'class="pip on"'), 4);
    assert.equal(count(html, 'class="pip"'), 3);
  });

  test('highlights the last used button', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, id(s, 'A'), 2));
    const html = V.renderPlayerCard(G.getPlayer(s, id(s, 'A')), s);
    assert.match(html, /class="life-btn is-active"[^>]*data-amount="2"/);
  });

  test('eliminated player shows revive button and no life buttons', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(G.subtractLife(s, id(s, 'A'), 7));
    const html = V.renderPlayerCard(G.getPlayer(s, id(s, 'A')), s);
    assert.ok(html.includes('data-action="revive"'));
    assert.ok(!html.includes('data-action="subtract"'));
    assert.ok(html.includes('is-eliminated'));
  });

  test('last-life player gets a warning modifier', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, id(s, 'A'), 6));
    const html = V.renderPlayerCard(G.getPlayer(s, id(s, 'A')), s);
    assert.ok(html.includes('is-warning'));
  });

  test('winner card is marked and its controls are disabled', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, id(s, 'A'), 7));
    const html = V.renderPlayerCard(G.getPlayer(s, id(s, 'B')), s);
    assert.ok(html.includes('is-winner'));
    assert.match(html, /data-action="subtract"[^>]*disabled/);
  });

  test('remove button only when round is not settled', () => {
    let s = gameWith(['A', 'B']);
    assert.ok(V.renderPlayerCard(s.players[0], s).includes('data-action="remove"'));
    s = must(G.subtractLife(s, id(s, 'A'), 7));
    assert.ok(!V.renderPlayerCard(s.players[1], s).includes('data-action="remove"'));
  });

  test('shows formatted balance with sign', () => {
    let s = gameWith(['A', 'B'], 250);
    s = must(G.subtractLife(s, id(s, 'A'), 7));
    assert.ok(V.renderPlayerCard(G.getPlayer(s, id(s, 'B')), s).includes('+2,50 €'));
    assert.ok(V.renderPlayerCard(G.getPlayer(s, id(s, 'A')), s).includes('−2,50 €'));
  });
});

describe('renderPlayers', () => {
  test('empty state shows a hint', () => {
    assert.ok(V.renderPlayers(gameWith([])).includes('empty'));
  });

  test('renders eliminated players last', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(G.subtractLife(s, id(s, 'A'), 7));
    const html = V.renderPlayers(s);
    assert.ok(html.indexOf('>B<') < html.indexOf('>A<'));
    assert.ok(html.indexOf('>C<') < html.indexOf('>A<'));
  });
});

describe('renderWinner', () => {
  test('empty when no winner', () => {
    assert.equal(V.renderWinner(gameWith(['A', 'B'])), '');
  });

  test('shows escaped winner name and pot', () => {
    let s = gameWith(['<A>', 'B'], 150);
    s = must(G.subtractLife(s, id(s, 'B'), 7));
    const html = V.renderWinner(s);
    assert.ok(html.includes('&lt;A&gt;'));
    assert.ok(html.includes('1,50 €'));
  });
});

describe('renderStats', () => {
  test('shows round, bet, alive count and pot', () => {
    let s = gameWith(['A', 'B', 'C'], 200);
    s = must(G.subtractLife(s, id(s, 'A'), 7));
    const html = V.renderStats(s);
    assert.ok(html.includes('01'));          // round number padded
    assert.ok(html.includes('2,00 €'));      // bet
    assert.ok(html.includes('2/3'));         // alive
    assert.ok(html.includes('4,00 €'));      // pot = bet * (n-1)
  });
});

describe('errorMessage', () => {
  test('every known error code has a German message', () => {
    for (const code of ['empty-name', 'duplicate-name', 'name-too-long', 'invalid-bet', 'bet-not-set', 'round-over', 'max-lives', 'eliminated', 'not-found', 'no-players', 'not-eliminated', 'invalid-amount']) {
      const msg = V.errorMessage(code);
      assert.ok(msg && !msg.includes(code), `missing message for ${code}`);
    }
  });
  test('unknown codes get a generic message', () => {
    assert.ok(V.errorMessage('???').length > 0);
  });
});

