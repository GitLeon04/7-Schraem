'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const S = require('../js/storage.js');

/* In-memory localStorage double */
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

function throwingStorage() {
  return {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); }
  };
}

function sampleState() {
  let s = G.setBet(G.createInitialState(), 300).state;
  s = G.addPlayer(s, 'A').state;
  s = G.addPlayer(s, 'B').state;
  s = G.addPlayer(s, 'C').state;
  s = G.subtractLife(s, s.players[0].id, 7).state;
  return s;
}

describe('saveState / loadState roundtrip', () => {
  test('restores an identical state', () => {
    const st = memoryStorage();
    const s = sampleState();
    assert.equal(S.saveState(st, s), true);
    assert.deepEqual(S.loadState(st), s);
  });

  test('roundtrips a settled round so revive still works after reload', () => {
    const st = memoryStorage();
    let s = sampleState();
    s = G.subtractLife(s, s.players[1].id, 7).state;
    assert.ok(G.isRoundOver(s));
    S.saveState(st, s);
    const loaded = S.loadState(st);
    const r = G.revivePlayer(loaded, loaded.players[1].id);
    assert.equal(r.ok, true);
    assert.deepEqual(r.state.players.map(p => p.balanceCents), [0, 0, 0]);
  });

  test('uses the documented storage key', () => {
    const st = memoryStorage();
    S.saveState(st, sampleState());
    assert.ok(st.data[S.STORAGE_KEY]);
  });
});

describe('loadState robustness', () => {
  test('returns a fresh initial state when nothing is stored', () => {
    assert.deepEqual(S.loadState(memoryStorage()), G.createInitialState());
  });

  test('REGRESSION: corrupt JSON does not crash, falls back to initial state', () => {
    const st = memoryStorage({ [S.STORAGE_KEY]: '{not json' });
    assert.deepEqual(S.loadState(st), G.createInitialState());
  });

  test('storage that throws (private mode) is handled', () => {
    assert.deepEqual(S.loadState(throwingStorage()), G.createInitialState());
    assert.equal(S.saveState(throwingStorage(), sampleState()), false);
    assert.doesNotThrow(() => S.clearState(throwingStorage()));
  });

  test('missing storage object is handled', () => {
    assert.deepEqual(S.loadState(null), G.createInitialState());
    assert.equal(S.saveState(undefined, sampleState()), false);
  });

  test('clearState removes new and legacy keys', () => {
    const st = memoryStorage({ [S.STORAGE_KEY]: '{}', [S.LEGACY_KEY]: '{}' });
    S.clearState(st);
    assert.equal(st.getItem(S.STORAGE_KEY), null);
    assert.equal(st.getItem(S.LEGACY_KEY), null);
  });
});

describe('sanitizeState', () => {
  test('rejects non-objects', () => {
    for (const bad of [null, 42, 'x', [], undefined]) {
      assert.equal(S.sanitizeState(bad), null);
    }
  });

  test('repairs invalid bet', () => {
    const s = S.sanitizeState({ ...sampleState(), betCents: -3 });
    assert.equal(s.betCents, G.DEFAULT_BET_CENTS);
  });

  test('drops malformed players and clamps lives', () => {
    const raw = sampleState();
    raw.players.push({ id: 'x' }, null, { id: 50, name: '', lives: 3 });
    raw.players[1].lives = 99;
    raw.players[2].lives = -4;
    const s = S.sanitizeState(raw);
    assert.equal(s.players.length, 3);
    assert.equal(s.players[1].lives, G.MAX_LIVES);
    assert.equal(s.players[2].lives, 0);
    assert.equal(s.players[2].eliminated, true);
  });

  test('drops duplicate ids and duplicate names', () => {
    const raw = sampleState();
    raw.players.push({ ...raw.players[0] });
    raw.players.push({ ...raw.players[1], id: 77, name: 'b' });
    const s = S.sanitizeState(raw);
    assert.equal(s.players.length, 3);
  });

  test('nextId is always greater than any existing id', () => {
    const raw = sampleState();
    raw.nextId = 1;
    const s = S.sanitizeState(raw);
    assert.ok(s.nextId > Math.max(...s.players.map(p => p.id)));
  });

  test('drops a settlement that references a missing winner', () => {
    const raw = sampleState();
    raw.round.settlement = { winnerId: 999, potCents: 100, betCents: 100, deltas: {} };
    assert.equal(S.sanitizeState(raw).round.settlement, null);
  });

  test('rounds float balances to integer cents', () => {
    const raw = sampleState();
    raw.players[0].balanceCents = 10.6;
    assert.equal(S.sanitizeState(raw).players[0].balanceCents, 11);
  });
});

describe('legacy migration (v1 "lifetracker-state")', () => {
  test('migrates players, lives, balances and bet', () => {
    const legacy = {
      players: [
        { name: 'Flaschko', displayName: 'Flaschko', life: 3, eliminated: false, balance: 4.2, lastAction: '-1' },
        { name: 'Tolj', displayName: 'Tolj', life: 0, eliminated: true, balance: -4.2, lastAction: '-7' },
        { name: 'Titan', displayName: 'Titan', life: 7, eliminated: false, balance: 0, lastAction: null }
      ],
      globalBet: 2.1
    };
    const st = memoryStorage({ [S.LEGACY_KEY]: JSON.stringify(legacy) });
    const s = S.loadState(st);
    assert.equal(s.betCents, 210);
    assert.equal(s.betConfirmed, true);
    assert.deepEqual(s.players.map(p => p.name), ['Flaschko', 'Tolj', 'Titan']);
    assert.deepEqual(s.players.map(p => p.lives), [3, 0, 7]);
    assert.deepEqual(s.players.map(p => p.balanceCents), [420, -420, 0]);
    assert.equal(s.players[1].eliminated, true);
    assert.equal(s.round.settlement, null);
  });

  test('migrated finished round becomes a reversible settlement', () => {
    const legacy = {
      players: [
        { name: 'A', life: 0, eliminated: true, balance: -2 },
        { name: 'B', life: 4, eliminated: false, balance: 2 }
      ],
      globalBet: 2
    };
    const s = S.migrateLegacy(legacy);
    assert.ok(s.round.settlement);
    assert.equal(G.getWinner(s).name, 'B');
    const r = G.revivePlayer(s, s.players[0].id);
    assert.deepEqual(r.state.players.map(p => p.balanceCents), [0, 0]);
  });

  test('new key wins over legacy key', () => {
    const s = sampleState();
    const st = memoryStorage({
      [S.STORAGE_KEY]: JSON.stringify(s),
      [S.LEGACY_KEY]: JSON.stringify({ players: [], globalBet: 9 })
    });
    assert.equal(S.loadState(st).betCents, 300);
  });

  test('garbage legacy data falls back to initial state', () => {
    const st = memoryStorage({ [S.LEGACY_KEY]: '"hello"' });
    assert.deepEqual(S.loadState(st), G.createInitialState());
  });
});

