/* ==================================================================
   7-Schräm – Spiellogik
   ------------------------------------------------------------------
   Reine Funktionen ohne DOM-Zugriff. Jede Aktion gibt ein Ergebnis
   { ok, state, error?, events[] } zurück und verändert den Eingabe-
   State niemals. Geldbeträge werden ausschließlich in Cent (Integer)
   gerechnet, um Rundungsfehler zu vermeiden.
================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchraemGame = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATE_VERSION     = 2;
  const MAX_LIVES         = 7;
  const DEFAULT_BET_CENTS = 200;
  const MAX_BET_CENTS     = 100000; // 1.000 €
  const MAX_NAME_LENGTH   = 32;

  const PRESET_NAMES = Object.freeze(['Flaschko', 'Eckmann', 'Ansgar', 'Ilkcross', 'Tolj', 'Titan']);

  const DEATH_SOUNDS = Object.freeze([
    'sounds/vine-boom.mp3',
    'sounds/metal-pipe-clang.mp3',
    'sounds/taco-bell-bong-sfx.mp3',
    'sounds/aughhhhh-aughhhhh.mp3',
    'sounds/better-call-saul-intro.mp3',
    'sounds/pimtopimati.mp3',
    'sounds/Fortnite-death-sound-effect.mp3',
    'sounds/troy bolton_1746556836_musicaldown.com.mp3'
  ]);

  /* ----------------------------------------------------------------
     Helpers
  ---------------------------------------------------------------- */
  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function ok(state, events) {
    return { ok: true, state, events: events || [] };
  }

  function fail(state, error) {
    return { ok: false, state, error, events: [] };
  }

  function isInt(n) {
    return typeof n === 'number' && Number.isInteger(n);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /* ----------------------------------------------------------------
     State
  ---------------------------------------------------------------- */
  function createInitialState() {
    return {
      version: STATE_VERSION,
      betCents: DEFAULT_BET_CENTS,
      betConfirmed: false,
      players: [],
      nextId: 1,
      round: { number: 1, settlement: null }
    };
  }

  function resetGame() {
    return createInitialState();
  }

  /* ----------------------------------------------------------------
     Einsatz
  ---------------------------------------------------------------- */
  const BET_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

  /** Wandelt Benutzereingabe in Cent um. Leer => Standard. Ungültig => null. */
  function parseBet(raw) {
    if (raw === null || raw === undefined) return DEFAULT_BET_CENTS;
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return null;
      raw = String(raw);
    }
    const str = String(raw).replace(/€/g, '').trim();
    if (str === '') return DEFAULT_BET_CENTS;
    if (!BET_PATTERN.test(str)) return null;

    const [whole, frac = ''] = str.split(/[.,]/);
    const cents = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
    if (cents <= 0 || cents > MAX_BET_CENTS) return null;
    return cents;
  }

  function isValidBet(cents) {
    return isInt(cents) && cents > 0 && cents <= MAX_BET_CENTS;
  }

  function setBet(state, cents) {
    if (!isValidBet(cents)) return fail(state, 'invalid-bet');
    const next = clone(state);
    next.betCents = cents;
    next.betConfirmed = true;
    return ok(next);
  }

  /* ----------------------------------------------------------------
     Namen
  ---------------------------------------------------------------- */
  function normalizeName(raw) {
    if (raw === null || raw === undefined) return '';
    return String(raw).replace(/\s+/g, ' ').trim();
  }

  function nameKey(name) {
    return normalizeName(name).toLocaleLowerCase('de-DE');
  }

  function isNameTaken(state, name) {
    const key = nameKey(name);
    return state.players.some(p => nameKey(p.name) === key);
  }

  function validateName(state, raw) {
    const name = normalizeName(raw);
    if (!name) return { ok: false, error: 'empty-name' };
    if (name.length > MAX_NAME_LENGTH) return { ok: false, error: 'name-too-long' };
    if (isNameTaken(state, name)) return { ok: false, error: 'duplicate-name' };
    return { ok: true, name };
  }

  /* ----------------------------------------------------------------
     Abfragen
  ---------------------------------------------------------------- */
  function getPlayer(state, id) {
    return state.players.find(p => p.id === id) || null;
  }

  function getAlivePlayers(state) {
    return state.players.filter(p => !p.eliminated);
  }

  function isRoundOver(state) {
    return state.round.settlement !== null;
  }

  function getWinner(state) {
    const st = state.round.settlement;
    return st ? getPlayer(state, st.winnerId) : null;
  }

  function getPotCents(state) {
    return state.betCents * Math.max(0, state.players.length - 1);
  }

  function getSortedPlayers(state) {
    return state.players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (a.p.eliminated - b.p.eliminated) || (a.i - b.i))
      .map(x => x.p);
  }

  function getLedger(state) {
    return state.players.slice().sort((a, b) => b.balanceCents - a.balanceCents);
  }

  function canRevive(state, id) {
    const p = getPlayer(state, id);
    return !!p && p.eliminated;
  }

  /* ----------------------------------------------------------------
     Abrechnung
  ---------------------------------------------------------------- */
  /** Prüft (auf einem bereits geklonten State), ob es einen Sieger gibt, und bucht ab. */
  function settleIfWinner(next, events) {
    if (next.round.settlement) return;
    if (next.players.length < 2) return;
    const alive = getAlivePlayers(next);
    if (alive.length !== 1) return;

    const winner = alive[0];
    const bet = next.betCents;
    const deltas = {};
    let pot = 0;
    for (const p of next.players) {
      if (p.id === winner.id) continue;
      p.balanceCents -= bet;
      deltas[p.id] = -bet;
      pot += bet;
    }
    winner.balanceCents += pot;
    deltas[winner.id] = pot;

    next.round.settlement = { winnerId: winner.id, potCents: pot, betCents: bet, deltas };
    events.push({ type: 'winner', playerId: winner.id, potCents: pot });
  }

  /** Macht eine Abrechnung exakt rückgängig. */
  function reverseSettlement(next, events) {
    const st = next.round.settlement;
    if (!st) return;
    for (const p of next.players) {
      const d = st.deltas[p.id];
      if (isInt(d)) p.balanceCents -= d;
    }
    next.round.settlement = null;
    events.push({ type: 'settlement-reversed', playerId: st.winnerId, potCents: st.potCents });
  }

  /* ----------------------------------------------------------------
     Spieler verwalten
  ---------------------------------------------------------------- */
  function addPlayer(state, rawName) {
    if (!state.betConfirmed) return fail(state, 'bet-not-set');
    if (isRoundOver(state)) return fail(state, 'round-over');
    const v = validateName(state, rawName);
    if (!v.ok) return fail(state, v.error);

    const next = clone(state);
    next.players.push({
      id: next.nextId,
      name: v.name,
      lives: MAX_LIVES,
      eliminated: false,
      livesBeforeElimination: null,
      balanceCents: 0,
      lastAction: null
    });
    next.nextId += 1;
    return ok(next, [{ type: 'player-added', playerId: next.nextId - 1 }]);
  }

  function removePlayer(state, id) {
    if (!getPlayer(state, id)) return fail(state, 'not-found');
    if (isRoundOver(state)) return fail(state, 'round-over');

    const next = clone(state);
    const events = [{ type: 'player-removed', playerId: id }];
    next.players = next.players.filter(p => p.id !== id);

    // Nur abrechnen, wenn in dieser Runde tatsächlich jemand ausgeschieden ist
    if (next.players.some(p => p.eliminated)) settleIfWinner(next, events);
    return ok(next, events);
  }

  /* ----------------------------------------------------------------
     Leben
  ---------------------------------------------------------------- */
  function subtractLife(state, id, amount) {
    if (amount === undefined) amount = 1;
    const player = getPlayer(state, id);
    if (!player) return fail(state, 'not-found');
    if (!isInt(amount) || amount < 1 || amount > MAX_LIVES) return fail(state, 'invalid-amount');
    if (isRoundOver(state)) return fail(state, 'round-over');
    if (player.eliminated) return fail(state, 'eliminated');

    const next = clone(state);
    const p = getPlayer(next, id);
    const before = p.lives;
    const events = [];

    p.lives = Math.max(0, p.lives - amount);
    p.lastAction = '-' + amount;

    if (p.lives === 0) {
      p.eliminated = true;
      p.livesBeforeElimination = before;
      events.push({ type: 'eliminated', playerId: p.id });
      settleIfWinner(next, events);
    }
    return ok(next, events);
  }

  function addLife(state, id) {
    const player = getPlayer(state, id);
    if (!player) return fail(state, 'not-found');
    if (isRoundOver(state)) return fail(state, 'round-over');
    if (player.eliminated) return fail(state, 'eliminated');
    if (player.lives >= MAX_LIVES) return fail(state, 'max-lives');

    const next = clone(state);
    const p = getPlayer(next, id);
    p.lives += 1;
    p.lastAction = '+1';
    return ok(next);
  }

  /**
   * Holt einen versehentlich eliminierten Spieler zurück.
   * Stellt die Leben vor dem tödlichen Abzug wieder her und macht – falls
   * dadurch eine Runde beendet wurde – die Auszahlung rückgängig.
   */
  function revivePlayer(state, id) {
    const player = getPlayer(state, id);
    if (!player) return fail(state, 'not-found');
    if (!player.eliminated) return fail(state, 'not-eliminated');

    const next = clone(state);
    const events = [];
    reverseSettlement(next, events);

    const p = getPlayer(next, id);
    const remembered = p.livesBeforeElimination;
    const lives = isInt(remembered) ? clamp(remembered, 1, MAX_LIVES) : 1;

    p.lives = lives;
    p.eliminated = false;
    p.livesBeforeElimination = null;
    p.lastAction = 'revive';
    events.push({ type: 'revived', playerId: id, lives });
    return ok(next, events);
  }

  /* ----------------------------------------------------------------
     Runden
  ---------------------------------------------------------------- */
  function nextRound(state) {
    if (state.players.length === 0) return fail(state, 'no-players');
    const next = clone(state);
    for (const p of next.players) {
      p.lives = MAX_LIVES;
      p.eliminated = false;
      p.livesBeforeElimination = null;
      p.lastAction = null;
    }
    next.round = { number: state.round.number + 1, settlement: null };
    return ok(next, [{ type: 'round-started', round: next.round.number }]);
  }

  /* ----------------------------------------------------------------
     Formatierung
  ---------------------------------------------------------------- */
  function formatAbsCents(abs) {
    const euros = Math.floor(abs / 100);
    const cents = String(abs % 100).padStart(2, '0');
    const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return grouped + ',' + cents;
  }

  function formatCents(cents, opts) {
    const sign = opts && opts.sign;
    const abs = Math.abs(Math.round(cents));
    let prefix = '';
    if (cents < 0) prefix = '−';
    else if (sign) prefix = cents > 0 ? '+' : '±';
    return prefix + formatAbsCents(abs) + ' €';
  }

  function formatBetInput(cents) {
    return formatAbsCents(Math.abs(cents));
  }

  /* ----------------------------------------------------------------
     Sounds
  ---------------------------------------------------------------- */
  function pickDeathSound(random, previous) {
    const rnd = typeof random === 'function' ? random : Math.random;
    const pool = DEATH_SOUNDS.length > 1 && previous
      ? DEATH_SOUNDS.filter(s => s !== previous)
      : DEATH_SOUNDS.slice();
    const idx = clamp(Math.floor(rnd() * pool.length), 0, pool.length - 1);
    return pool[idx];
  }

  return Object.freeze({
    STATE_VERSION, MAX_LIVES, DEFAULT_BET_CENTS, MAX_BET_CENTS, MAX_NAME_LENGTH,
    PRESET_NAMES, DEATH_SOUNDS,
    createInitialState, resetGame,
    parseBet, isValidBet, setBet,
    normalizeName, validateName, isNameTaken,
    getPlayer, getAlivePlayers, isRoundOver, getWinner, getPotCents,
    getSortedPlayers, getLedger, canRevive,
    addPlayer, removePlayer, subtractLife, addLife, revivePlayer, nextRound,
    formatCents, formatBetInput, pickDeathSound
  });
});
