'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');

/* ------------------------------------------------------------------
   Helpers
------------------------------------------------------------------ */
function must(result) {
  assert.equal(result.ok, true, `expected ok, got error "${result.error}"`);
  return result.state;
}

function gameWith(names, betCents = 200) {
  let s = must(G.setBet(G.createInitialState(), betCents));
  for (const n of names) s = must(G.addPlayer(s, n));
  return s;
}

function idOf(state, name) {
  return state.players.find(p => p.name === name).id;
}

function kill(state, name) {
  return G.subtractLife(state, idOf(state, name), G.MAX_LIVES);
}

/* ------------------------------------------------------------------
   Initial state
------------------------------------------------------------------ */
describe('createInitialState', () => {
  test('starts with default bet, no players, round 1, no settlement', () => {
    const s = G.createInitialState();
    assert.equal(s.betCents, G.DEFAULT_BET_CENTS);
    assert.equal(s.betConfirmed, false);
    assert.deepEqual(s.players, []);
    assert.equal(s.round.number, 1);
    assert.equal(s.round.settlement, null);
    assert.equal(s.version, G.STATE_VERSION);
  });

  test('returns a fresh object every time', () => {
    const a = G.createInitialState();
    const b = G.createInitialState();
    a.players.push({});
    assert.equal(b.players.length, 0);
  });

  test('constants are sane', () => {
    assert.equal(G.MAX_LIVES, 7);
    assert.equal(G.DEFAULT_BET_CENTS, 200);
    assert.ok(G.PRESET_NAMES.length > 0);
    assert.ok(G.DEATH_SOUNDS.length > 0);
  });
});

/* ------------------------------------------------------------------
   Bet parsing
------------------------------------------------------------------ */
describe('parseBet', () => {
  test('empty input falls back to default bet', () => {
    assert.equal(G.parseBet(''), G.DEFAULT_BET_CENTS);
    assert.equal(G.parseBet('   '), G.DEFAULT_BET_CENTS);
    assert.equal(G.parseBet(null), G.DEFAULT_BET_CENTS);
    assert.equal(G.parseBet(undefined), G.DEFAULT_BET_CENTS);
  });

  test('parses integers and dot decimals into cents', () => {
    assert.equal(G.parseBet('2'), 200);
    assert.equal(G.parseBet('2.5'), 250);
    assert.equal(G.parseBet('0.01'), 1);
    assert.equal(G.parseBet('10.99'), 1099);
  });

  test('accepts German comma decimals', () => {
    assert.equal(G.parseBet('2,50'), 250);
    assert.equal(G.parseBet('0,1'), 10);
  });

  test('accepts a euro sign and surrounding whitespace', () => {
    assert.equal(G.parseBet(' 3 € '), 300);
    assert.equal(G.parseBet('€1,20'), 120);
  });

  test('avoids floating point errors', () => {
    assert.equal(G.parseBet('0.29'), 29);
    assert.equal(G.parseBet('1.15'), 115);
    assert.equal(G.parseBet('4.35'), 435);
  });

  test('rejects zero, negatives and garbage', () => {
    for (const bad of ['0', '0,00', '-1', 'abc', '1,2,3', '1.2.3', '1e3', '2,505', 'NaN', 'Infinity']) {
      assert.equal(G.parseBet(bad), null, `"${bad}" should be rejected`);
    }
  });

  test('rejects absurdly large bets', () => {
    assert.equal(G.parseBet(String(G.MAX_BET_CENTS / 100)), G.MAX_BET_CENTS);
    assert.equal(G.parseBet(String(G.MAX_BET_CENTS / 100 + 1)), null);
  });

  test('accepts numbers directly', () => {
    assert.equal(G.parseBet(2), 200);
    assert.equal(G.parseBet(0.5), 50);
  });
});

/* ------------------------------------------------------------------
   setBet
------------------------------------------------------------------ */
describe('setBet', () => {
  test('stores bet and marks it confirmed', () => {
    const s = must(G.setBet(G.createInitialState(), 350));
    assert.equal(s.betCents, 350);
    assert.equal(s.betConfirmed, true);
  });

  test('does not mutate the input state', () => {
    const s0 = G.createInitialState();
    G.setBet(s0, 500);
    assert.equal(s0.betCents, G.DEFAULT_BET_CENTS);
    assert.equal(s0.betConfirmed, false);
  });

  test('rejects invalid cents', () => {
    const s0 = G.createInitialState();
    for (const bad of [0, -5, 1.5, NaN, null, undefined, '200', G.MAX_BET_CENTS + 1]) {
      const r = G.setBet(s0, bad);
      assert.equal(r.ok, false);
      assert.equal(r.error, 'invalid-bet');
      assert.equal(r.state, s0);
    }
  });

  test('can change the bet mid-session without touching balances', () => {
    let s = gameWith(['A', 'B']);
    s = must(kill(s, 'A'));
    const balances = s.players.map(p => p.balanceCents);
    s = must(G.setBet(s, 1000));
    assert.deepEqual(s.players.map(p => p.balanceCents), balances);
    assert.equal(s.betCents, 1000);
  });
});

/* ------------------------------------------------------------------
   Names
------------------------------------------------------------------ */
describe('normalizeName / validateName', () => {
  test('trims and collapses whitespace', () => {
    assert.equal(G.normalizeName('  Max   Mustermann  '), 'Max Mustermann');
    assert.equal(G.normalizeName('\tTim\n'), 'Tim');
  });

  test('handles non-strings', () => {
    assert.equal(G.normalizeName(null), '');
    assert.equal(G.normalizeName(undefined), '');
    assert.equal(G.normalizeName(42), '42');
  });

  test('rejects empty names', () => {
    const s = gameWith([]);
    assert.deepEqual(G.validateName(s, '   '), { ok: false, error: 'empty-name' });
  });

  test('rejects too long names', () => {
    const s = gameWith([]);
    const r = G.validateName(s, 'x'.repeat(G.MAX_NAME_LENGTH + 1));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'name-too-long');
    assert.equal(G.validateName(s, 'x'.repeat(G.MAX_NAME_LENGTH)).ok, true);
  });

  test('rejects duplicates case-insensitively and whitespace-insensitively', () => {
    const s = gameWith(['Flaschko']);
    assert.equal(G.validateName(s, 'flaschko').error, 'duplicate-name');
    assert.equal(G.validateName(s, '  FLASCHKO ').error, 'duplicate-name');
  });

  test('returns the normalized name when valid', () => {
    const s = gameWith([]);
    assert.deepEqual(G.validateName(s, '  Tim  '), { ok: true, name: 'Tim' });
  });
});

/* ------------------------------------------------------------------
   addPlayer
------------------------------------------------------------------ */
describe('addPlayer', () => {
  test('adds a player with full lives and zero balance', () => {
    const s = gameWith(['Tim']);
    assert.equal(s.players.length, 1);
    const p = s.players[0];
    assert.equal(p.name, 'Tim');
    assert.equal(p.lives, G.MAX_LIVES);
    assert.equal(p.eliminated, false);
    assert.equal(p.balanceCents, 0);
    assert.equal(p.lastAction, null);
  });

  test('assigns unique incrementing ids', () => {
    const s = gameWith(['A', 'B', 'C']);
    const ids = s.players.map(p => p.id);
    assert.equal(new Set(ids).size, 3);
    assert.ok(ids[0] < ids[1] && ids[1] < ids[2]);
  });

  test('ids are never reused after removal', () => {
    let s = gameWith(['A', 'B']);
    const removedId = idOf(s, 'B');
    s = must(G.removePlayer(s, removedId));
    s = must(G.addPlayer(s, 'C'));
    assert.notEqual(idOf(s, 'C'), removedId);
  });

  test('requires a confirmed bet first', () => {
    const r = G.addPlayer(G.createInitialState(), 'Tim');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'bet-not-set');
  });

  test('rejects duplicates', () => {
    const s = gameWith(['Tim']);
    const r = G.addPlayer(s, 'tim');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'duplicate-name');
    assert.equal(r.state.players.length, 1);
  });

  test('rejects empty names', () => {
    const r = G.addPlayer(gameWith([]), '');
    assert.equal(r.error, 'empty-name');
  });

  test('cannot add players once the round has a winner', () => {
    let s = gameWith(['A', 'B']);
    s = must(kill(s, 'A'));
    const r = G.addPlayer(s, 'C');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'round-over');
  });

  test('late joiners can be added during a running round', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    s = must(G.addPlayer(s, 'D'));
    assert.equal(s.players.length, 4);
    assert.equal(G.getAlivePlayers(s).length, 3);
  });

  test('keeps names with HTML characters verbatim (escaping is the view\'s job)', () => {
    const s = gameWith(['<b>"x"</b>']);
    assert.equal(s.players[0].name, '<b>"x"</b>');
  });

  test('does not mutate input', () => {
    const s0 = gameWith([]);
    G.addPlayer(s0, 'Tim');
    assert.equal(s0.players.length, 0);
  });
});

/* ------------------------------------------------------------------
   removePlayer
------------------------------------------------------------------ */
describe('removePlayer', () => {
  test('removes the player', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.removePlayer(s, idOf(s, 'A')));
    assert.deepEqual(s.players.map(p => p.name), ['B']);
  });

  test('unknown id yields not-found', () => {
    const r = G.removePlayer(gameWith(['A']), 999);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'not-found');
  });

  test('is blocked while a round is settled (would corrupt the ledger)', () => {
    let s = gameWith(['A', 'B']);
    s = must(kill(s, 'A'));
    const r = G.removePlayer(s, idOf(s, 'A'));
    assert.equal(r.error, 'round-over');
  });

  test('if removal leaves a single survivor among 2+ players, that survivor wins', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    const r = G.removePlayer(s, idOf(s, 'B'));
    s = must(r);
    assert.ok(s.round.settlement);
    assert.equal(s.round.settlement.winnerId, idOf(s, 'C'));
    assert.ok(r.events.some(e => e.type === 'winner'));
  });

  test('removing down to one untouched player does not declare a winner', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.removePlayer(s, idOf(s, 'A')));
    assert.equal(s.round.settlement, null);
  });
});

/* ------------------------------------------------------------------
   togglePausePlayer
------------------------------------------------------------------ */
describe('togglePausePlayer', () => {
  test('pausing toggles paused state and keeps existing balance', () => {
    let s = gameWith(['A', 'B', 'C'], 200);
    const pA = idOf(s, 'A');
    G.getPlayer(s, pA).balanceCents = 300; // prior balance
    const res = G.togglePausePlayer(s, pA);
    s = must(res);
    assert.equal(G.getPlayer(s, pA).paused, true);
    assert.equal(G.getPlayer(s, pA).balanceCents, 300);
    assert.ok(res.events.some(e => e.type === 'player-paused'));
  });

  test('paused player does not pay bet when another player wins', () => {
    let s = gameWith(['A', 'B', 'C'], 200);
    const pA = idOf(s, 'A');
    const pB = idOf(s, 'B');
    const pC = idOf(s, 'C');
    G.getPlayer(s, pA).balanceCents = 500;
    G.getPlayer(s, pB).balanceCents = -200;
    G.getPlayer(s, pC).balanceCents = -300;

    // Pause player A
    s = must(G.togglePausePlayer(s, pA));
    assert.equal(G.getPotCents(s), 200); // 2 participating: (2 - 1) * 200 = 200

    // B loses all lives, C wins
    s = must(G.subtractLife(s, pB, 7));
    assert.ok(s.round.settlement);
    assert.equal(s.round.settlement.winnerId, pC);
    assert.equal(s.round.settlement.potCents, 200);

    // Paused player A paid 0
    assert.equal(G.getPlayer(s, pA).balanceCents, 500);
    // B paid 200
    assert.equal(G.getPlayer(s, pB).balanceCents, -400);
    // C won 200
    assert.equal(G.getPlayer(s, pC).balanceCents, -100);

    // Invariant: sum of all balances is exactly 0
    const sum = s.players.reduce((acc, p) => acc + p.balanceCents, 0);
    assert.equal(sum, 0);
  });

  test('unpausing restores player with 7 lives and active status', () => {
    let s = gameWith(['A', 'B', 'C']);
    const pA = idOf(s, 'A');
    s = must(G.togglePausePlayer(s, pA));
    assert.equal(G.getPlayer(s, pA).paused, true);

    const res = G.togglePausePlayer(s, pA);
    s = must(res);
    assert.equal(G.getPlayer(s, pA).paused, false);
    assert.equal(G.getPlayer(s, pA).lives, 7);
    assert.equal(G.getPlayer(s, pA).eliminated, false);
    assert.ok(res.events.some(e => e.type === 'player-unpaused'));
  });

  test('cannot toggle pause when round is already settled', () => {
    let s = gameWith(['A', 'B'], 200);
    s = must(G.subtractLife(s, idOf(s, 'A'), 7));
    assert.ok(G.isRoundOver(s));
    const res = G.togglePausePlayer(s, idOf(s, 'B'));
    assert.equal(res.ok, false);
    assert.equal(res.error, 'round-over');
  });
});

/* ------------------------------------------------------------------
   subtractLife
------------------------------------------------------------------ */
describe('subtractLife', () => {
  test('subtracts the given amount and records lastAction', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, idOf(s, 'A'), 3));
    const a = G.getPlayer(s, idOf(s, 'A'));
    assert.equal(a.lives, 4);
    assert.equal(a.lastAction, '-3');
    assert.equal(a.eliminated, false);
  });

  test('defaults to 1', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, idOf(s, 'A')));
    assert.equal(G.getPlayer(s, idOf(s, 'A')).lives, 6);
  });

  test('never goes below zero', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(G.subtractLife(s, idOf(s, 'A'), 5));
    s = must(G.subtractLife(s, idOf(s, 'A'), 5));
    assert.equal(G.getPlayer(s, idOf(s, 'A')).lives, 0);
  });

  test('eliminates at zero, remembers lives before elimination, emits event', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(G.subtractLife(s, idOf(s, 'A'), 2));
    const r = G.subtractLife(s, idOf(s, 'A'), 7);
    s = must(r);
    const a = G.getPlayer(s, idOf(s, 'A'));
    assert.equal(a.eliminated, true);
    assert.equal(a.livesBeforeElimination, 5);
    assert.deepEqual(r.events, [{ type: 'eliminated', playerId: a.id }]);
  });

  test('cannot hit an eliminated player', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    const r = kill(s, 'A');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'eliminated');
  });

  test('validates amount', () => {
    const s = gameWith(['A', 'B']);
    const id = idOf(s, 'A');
    for (const bad of [0, -1, 8, 1.5, NaN, '2', null]) {
      const r = G.subtractLife(s, id, bad);
      assert.equal(r.ok, false, `amount ${bad} should fail`);
      assert.equal(r.error, 'invalid-amount');
    }
  });

  test('unknown player yields not-found', () => {
    const r = G.subtractLife(gameWith(['A', 'B']), 12345, 1);
    assert.equal(r.error, 'not-found');
  });

  test('does not mutate input', () => {
    const s0 = gameWith(['A', 'B']);
    G.subtractLife(s0, idOf(s0, 'A'), 3);
    assert.equal(s0.players[0].lives, G.MAX_LIVES);
  });

  test('single player game never declares a winner', () => {
    let s = gameWith(['Solo']);
    const r = G.subtractLife(s, idOf(s, 'Solo'), 1);
    s = must(r);
    assert.equal(s.round.settlement, null);
    assert.equal(s.players[0].balanceCents, 0);
    assert.ok(!r.events.some(e => e.type === 'winner'));
  });
});

/* ------------------------------------------------------------------
   addLife
------------------------------------------------------------------ */
describe('addLife', () => {
  test('adds one life', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, idOf(s, 'A'), 3));
    s = must(G.addLife(s, idOf(s, 'A')));
    const a = G.getPlayer(s, idOf(s, 'A'));
    assert.equal(a.lives, 5);
    assert.equal(a.lastAction, '+1');
  });

  test('cannot exceed MAX_LIVES', () => {
    const s = gameWith(['A', 'B']);
    const r = G.addLife(s, idOf(s, 'A'));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'max-lives');
  });

  test('cannot add to an eliminated player (use revive)', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    assert.equal(G.addLife(s, idOf(s, 'A')).error, 'eliminated');
  });

  test('blocked after the round is settled', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, idOf(s, 'B'), 1));
    s = must(kill(s, 'A'));
    assert.equal(G.addLife(s, idOf(s, 'B')).error, 'round-over');
  });

  test('unknown player yields not-found', () => {
    assert.equal(G.addLife(gameWith(['A']), 77).error, 'not-found');
  });
});

/* ------------------------------------------------------------------
   Winner / settlement
------------------------------------------------------------------ */
describe('settlement', () => {
  test('last survivor wins the pot of all other bets', () => {
    let s = gameWith(['A', 'B', 'C'], 250);
    s = must(kill(s, 'A'));
    assert.equal(s.round.settlement, null);
    const r = kill(s, 'B');
    s = must(r);
    const st = s.round.settlement;
    assert.equal(st.winnerId, idOf(s, 'C'));
    assert.equal(st.potCents, 500);
    assert.equal(G.getPlayer(s, idOf(s, 'C')).balanceCents, 500);
    assert.equal(G.getPlayer(s, idOf(s, 'A')).balanceCents, -250);
    assert.equal(G.getPlayer(s, idOf(s, 'B')).balanceCents, -250);
    assert.deepEqual(
      r.events.map(e => e.type),
      ['eliminated', 'winner']
    );
    assert.equal(r.events[1].potCents, 500);
  });

  test('ledger always sums to zero', () => {
    let s = gameWith(['A', 'B', 'C', 'D'], 199);
    s = must(kill(s, 'A'));
    s = must(kill(s, 'C'));
    s = must(kill(s, 'D'));
    const sum = s.players.reduce((acc, p) => acc + p.balanceCents, 0);
    assert.equal(sum, 0);
  });

  test('REGRESSION: hitting the winner after the round does not pay out twice', () => {
    let s = gameWith(['A', 'B']);
    s = must(kill(s, 'A'));
    const before = s.players.map(p => p.balanceCents);
    const r = G.subtractLife(s, idOf(s, 'B'), 1);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'round-over');
    assert.deepEqual(r.state.players.map(p => p.balanceCents), before);
  });

  test('isRoundOver / getWinner reflect settlement', () => {
    let s = gameWith(['A', 'B']);
    assert.equal(G.isRoundOver(s), false);
    assert.equal(G.getWinner(s), null);
    s = must(kill(s, 'A'));
    assert.equal(G.isRoundOver(s), true);
    assert.equal(G.getWinner(s).name, 'B');
  });

  test('balances accumulate over multiple rounds', () => {
    let s = gameWith(['A', 'B']);
    s = must(kill(s, 'A'));
    s = must(G.nextRound(s));
    s = must(kill(s, 'A'));
    s = must(G.nextRound(s));
    s = must(kill(s, 'B'));
    assert.equal(G.getPlayer(s, idOf(s, 'A')).balanceCents, -200);
    assert.equal(G.getPlayer(s, idOf(s, 'B')).balanceCents, 200);
  });

  test('settlement uses the bet active at the moment of settling', () => {
    let s = gameWith(['A', 'B'], 100);
    s = must(G.setBet(s, 300));
    s = must(kill(s, 'A'));
    assert.equal(s.round.settlement.potCents, 300);
  });
});

/* ------------------------------------------------------------------
   Revive
------------------------------------------------------------------ */
describe('revivePlayer', () => {
  test('restores the lives the player had before the fatal hit', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(G.subtractLife(s, idOf(s, 'A'), 2)); // 5 left
    s = must(kill(s, 'A'));                         // oops, -7
    const r = G.revivePlayer(s, idOf(s, 'A'));
    s = must(r);
    const a = G.getPlayer(s, idOf(s, 'A'));
    assert.equal(a.eliminated, false);
    assert.equal(a.lives, 5);
    assert.equal(a.lastAction, 'revive');
    assert.equal(a.livesBeforeElimination, null);
    assert.deepEqual(r.events, [{ type: 'revived', playerId: a.id, lives: 5 }]);
  });

  test('falls back to 1 life when the previous value is unknown', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    s.players[0].livesBeforeElimination = null;
    s = must(G.revivePlayer(s, idOf(s, 'A')));
    assert.equal(G.getPlayer(s, idOf(s, 'A')).lives, 1);
  });

  test('clamps bogus remembered lives into 1..MAX_LIVES', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    s.players[0].livesBeforeElimination = 99;
    s = must(G.revivePlayer(s, idOf(s, 'A')));
    assert.equal(G.getPlayer(s, idOf(s, 'A')).lives, G.MAX_LIVES);
  });

  test('cannot revive a living player', () => {
    const s = gameWith(['A', 'B']);
    const r = G.revivePlayer(s, idOf(s, 'A'));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'not-eliminated');
  });

  test('unknown player yields not-found', () => {
    assert.equal(G.revivePlayer(gameWith(['A']), 999).error, 'not-found');
  });

  test('reviving after an accidental win reverses the payout exactly', () => {
    let s = gameWith(['A', 'B', 'C'], 300);
    s = must(kill(s, 'A'));
    s = must(G.subtractLife(s, idOf(s, 'B'), 1)); // B had 6
    s = must(kill(s, 'B'));                         // accidental -> C wins
    assert.ok(G.isRoundOver(s));

    const r = G.revivePlayer(s, idOf(s, 'B'));
    s = must(r);
    assert.equal(s.round.settlement, null);
    assert.equal(G.isRoundOver(s), false);
    assert.deepEqual(s.players.map(p => p.balanceCents), [0, 0, 0]);
    assert.equal(G.getPlayer(s, idOf(s, 'B')).lives, 6);
    assert.deepEqual(r.events.map(e => e.type), ['settlement-reversed', 'revived']);
  });

  test('reversal keeps balances from earlier rounds intact', () => {
    let s = gameWith(['A', 'B']);
    s = must(kill(s, 'A'));          // round 1: B +200, A -200
    s = must(G.nextRound(s));
    s = must(kill(s, 'B'));          // round 2: A wins -> 0 / 0
    s = must(G.revivePlayer(s, idOf(s, 'B')));
    assert.equal(G.getPlayer(s, idOf(s, 'A')).balanceCents, -200);
    assert.equal(G.getPlayer(s, idOf(s, 'B')).balanceCents, 200);
  });

  test('only the last eliminated player can be revived in the current round', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    s = must(kill(s, 'B'));
    // A was not the last eliminated, so reviving A fails
    const failA = G.revivePlayer(s, idOf(s, 'A'));
    assert.equal(failA.ok, false);
    assert.equal(failA.error, 'not-last-eliminated');

    // Reviving B (last eliminated) succeeds and reopens round
    s = must(G.revivePlayer(s, idOf(s, 'B')));
    assert.equal(s.round.settlement, null);
    assert.equal(G.getAlivePlayers(s).length, 2);

    // Now that B is alive, A is at top of stack and can be revived
    s = must(G.revivePlayer(s, idOf(s, 'A')));
    assert.equal(G.getAlivePlayers(s).length, 3);
  });

  test('revive is strictly impossible across round transitions', () => {
    let s = gameWith(['A', 'B']);
    s = must(kill(s, 'A'));
    s = must(G.nextRound(s));
    assert.equal(G.canRevive(s, idOf(s, 'A')), false);
    const r = G.revivePlayer(s, idOf(s, 'A'));
    assert.equal(r.ok, false);
  });

  test('game continues correctly after revive and pays out once', () => {
    let s = gameWith(['A', 'B']);
    s = must(kill(s, 'A'));
    s = must(G.revivePlayer(s, idOf(s, 'A')));
    s = must(G.subtractLife(s, idOf(s, 'B'), 7));
    assert.equal(G.getWinner(s).name, 'A');
    assert.equal(G.getPlayer(s, idOf(s, 'A')).balanceCents, 200);
    assert.equal(G.getPlayer(s, idOf(s, 'B')).balanceCents, -200);
  });

  test('revive works in a round that never got a winner', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    s = must(G.revivePlayer(s, idOf(s, 'A')));
    assert.equal(G.getAlivePlayers(s).length, 3);
  });

  test('canRevive helper', () => {
    let s = gameWith(['A', 'B', 'C']);
    assert.equal(G.canRevive(s, idOf(s, 'A')), false);
    s = must(kill(s, 'A'));
    assert.equal(G.canRevive(s, idOf(s, 'A')), true);
    assert.equal(G.canRevive(s, 999), false);
  });
});

/* ------------------------------------------------------------------
   nextRound / reset
------------------------------------------------------------------ */
describe('nextRound', () => {
  test('resets lives, elimination and lastAction, keeps balances, bumps round', () => {
    let s = gameWith(['A', 'B']);
    s = must(G.subtractLife(s, idOf(s, 'B'), 2));
    s = must(kill(s, 'A'));
    s = must(G.nextRound(s));
    assert.equal(s.round.number, 2);
    assert.equal(s.round.settlement, null);
    for (const p of s.players) {
      assert.equal(p.lives, G.MAX_LIVES);
      assert.equal(p.eliminated, false);
      assert.equal(p.lastAction, null);
      assert.equal(p.livesBeforeElimination, null);
    }
    assert.equal(G.getPlayer(s, idOf(s, 'B')).balanceCents, 200);
  });

  test('works without a winner (no payout)', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    s = must(G.nextRound(s));
    assert.deepEqual(s.players.map(p => p.balanceCents), [0, 0, 0]);
  });

  test('requires at least one player', () => {
    const r = G.nextRound(gameWith([]));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no-players');
  });
});

describe('resetGame', () => {
  test('returns a pristine initial state', () => {
    const s = G.resetGame();
    assert.deepEqual(s, G.createInitialState());
  });
});

/* ------------------------------------------------------------------
   Queries
------------------------------------------------------------------ */
describe('queries', () => {
  test('getSortedPlayers puts eliminated last and keeps join order otherwise', () => {
    let s = gameWith(['A', 'B', 'C', 'D']);
    s = must(kill(s, 'B'));
    s = must(kill(s, 'A'));
    assert.deepEqual(G.getSortedPlayers(s).map(p => p.name), ['C', 'D', 'A', 'B']);
  });

  test('getSortedPlayers does not mutate state order', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    G.getSortedPlayers(s);
    assert.deepEqual(s.players.map(p => p.name), ['A', 'B', 'C']);
  });

  test('getLedger sorts by balance descending', () => {
    let s = gameWith(['A', 'B', 'C']);
    s = must(kill(s, 'A'));
    s = must(kill(s, 'C'));
    assert.equal(G.getLedger(s)[0].name, 'B');
  });

  test('isPresetUsed is case-insensitive', () => {
    const s = gameWith(['flaschko']);
    assert.equal(G.isNameTaken(s, 'Flaschko'), true);
    assert.equal(G.isNameTaken(s, 'Tolj'), false);
  });
});

/* ------------------------------------------------------------------
   Money formatting
------------------------------------------------------------------ */
describe('formatCents', () => {
  test('formats German style', () => {
    assert.equal(G.formatCents(0), '0,00 €');
    assert.equal(G.formatCents(5), '0,05 €');
    assert.equal(G.formatCents(250), '2,50 €');
    assert.equal(G.formatCents(123456), '1.234,56 €');
  });

  test('negative amounts', () => {
    assert.equal(G.formatCents(-250), '−2,50 €');
  });

  test('optional explicit sign', () => {
    assert.equal(G.formatCents(250, { sign: true }), '+2,50 €');
    assert.equal(G.formatCents(-250, { sign: true }), '−2,50 €');
    assert.equal(G.formatCents(0, { sign: true }), '±0,00 €');
  });

  test('formatBetInput gives an editable value', () => {
    assert.equal(G.formatBetInput(250), '2,50');
    assert.equal(G.formatBetInput(200), '2,00');
  });
});

/* ------------------------------------------------------------------
   Sounds
------------------------------------------------------------------ */
describe('pickDeathSound', () => {
  test('uses the injected random source', () => {
    assert.equal(G.pickDeathSound(() => 0), G.DEATH_SOUNDS[0]);
    assert.equal(G.pickDeathSound(() => 0.9999999), G.DEATH_SOUNDS[G.DEATH_SOUNDS.length - 1]);
  });

  test('never goes out of bounds even if random returns 1', () => {
    assert.equal(G.pickDeathSound(() => 1), G.DEATH_SOUNDS[G.DEATH_SOUNDS.length - 1]);
  });

  test('avoids repeating the previous sound when possible', () => {
    const first = G.DEATH_SOUNDS[0];
    assert.notEqual(G.pickDeathSound(() => 0, first), first);
  });
});

/* ------------------------------------------------------------------
   History & Time Travel
------------------------------------------------------------------ */
describe('history & restoreHistory', () => {
  test('logs every action in text form with player summary snapshot', () => {
    let s = gameWith(['Flaschko', 'Eckmann']);
    assert.ok(s.history.length >= 3); // setBet, add Flaschko, add Eckmann
    assert.equal(s.history[0].type, 'set-bet');
    assert.equal(s.history[1].type, 'add-player');
    assert.equal(s.history[2].type, 'add-player');

    s = must(G.subtractLife(s, idOf(s, 'Flaschko'), 2));
    const last = s.history[s.history.length - 1];
    assert.equal(last.type, 'subtract');
    assert.match(last.text, /Flaschko: −2 Leben/);
    assert.ok(Array.isArray(last.summary));
    assert.equal(last.summary.find(p => p.name === 'Flaschko').lives, 5);
  });

  test('restoreHistory rolls back exact game state while preserving log', () => {
    let s = gameWith(['Flaschko', 'Eckmann']);
    s = must(G.subtractLife(s, idOf(s, 'Flaschko'), 3));
    const checkpointId = s.history[s.history.length - 1].id;
    assert.equal(G.getPlayer(s, idOf(s, 'Flaschko')).lives, 4);

    // Weiter spielen: Flaschko verliert noch ein Leben
    s = must(G.subtractLife(s, idOf(s, 'Flaschko'), 2));
    assert.equal(G.getPlayer(s, idOf(s, 'Flaschko')).lives, 2);

    // Zeitreise zurück zum Checkpoint
    const restored = must(G.restoreHistory(s, checkpointId));
    assert.equal(G.getPlayer(restored, idOf(restored, 'Flaschko')).lives, 4);
    // Audit-Log hat den Restore-Eintrag angehängt
    const latestLog = restored.history[restored.history.length - 1];
    assert.equal(latestLog.type, 'restore');
    assert.match(latestLog.text, /Stand wiederhergestellt/);
  });

  test('restoreHistory handles invalid id gracefully', () => {
    const s = gameWith(['A', 'B']);
    const r = G.restoreHistory(s, 9999);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'entry-not-found');
  });

  test('new preset names are included', () => {
    for (const name of ['Marlon', 'Sören', 'Marco', 'Patrick', 'Prägi']) {
      assert.ok(G.PRESET_NAMES.includes(name), `Expected ${name} in PRESET_NAMES`);
    }
  });
});

