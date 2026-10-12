/* ==================================================================
   7-Schräm – Persistenz
   ------------------------------------------------------------------
   Speichert/lädt den Spielstand robust (kaputtes JSON, gesperrter
   Storage, manipulierte Daten) und migriert alte v1-Spielstände.
================================================================== */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./game.js') : root.SchraemGame
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchraemStorage = api;
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  const STORAGE_KEY = 'schraem-state-v2';
  const LEGACY_KEY  = 'lifetracker-state';

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function toInt(v, fallback) {
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  }

  function safeGet(storage, key) {
    try { return storage ? storage.getItem(key) : null; } catch (e) { return null; }
  }

  function safeParse(raw) {
    if (typeof raw !== 'string') return undefined;
    try { return JSON.parse(raw); } catch (e) { return undefined; }
  }

  /* ----------------------------------------------------------------
     Validierung
  ---------------------------------------------------------------- */
  function sanitizePlayer(raw) {
    if (!isObj(raw)) return null;
    if (!Number.isInteger(raw.id) || raw.id < 1) return null;
    const name = G.normalizeName(raw.name);
    if (!name || name.length > G.MAX_NAME_LENGTH) return null;

    const lives = Math.min(G.MAX_LIVES, Math.max(0, toInt(raw.lives, G.MAX_LIVES)));
    const eliminated = lives === 0; // Single source of truth: 0 Leben == eliminiert
    const lbe = toInt(raw.livesBeforeElimination, null);

    return {
      id: raw.id,
      name,
      lives,
      eliminated,
      livesBeforeElimination: eliminated && lbe !== null ? Math.min(G.MAX_LIVES, Math.max(1, lbe)) : null,
      balanceCents: toInt(raw.balanceCents, 0),
      lastAction: typeof raw.lastAction === 'string' ? raw.lastAction : null,
      paused: Boolean(raw.paused)
    };
  }

  function sanitizeSettlement(raw, players) {
    if (!isObj(raw)) return null;
    if (!players.some(p => p.id === raw.winnerId)) return null;
    if (!isObj(raw.deltas)) return null;
    const deltas = {};
    for (const p of players) {
      const d = raw.deltas[p.id];
      if (typeof d === 'number' && Number.isInteger(d)) deltas[p.id] = d;
    }
    return {
      winnerId: raw.winnerId,
      potCents: toInt(raw.potCents, 0),
      betCents: toInt(raw.betCents, 0),
      deltas
    };
  }

  function sanitizeState(raw) {
    if (!isObj(raw)) return null;
    const base = G.createInitialState();

    const players = [];
    const seenIds = new Set();
    const seenNames = new Set();
    for (const rp of Array.isArray(raw.players) ? raw.players : []) {
      const p = sanitizePlayer(rp);
      if (!p) continue;
      const key = p.name.toLocaleLowerCase('de-DE');
      if (seenIds.has(p.id) || seenNames.has(key)) continue;
      seenIds.add(p.id);
      seenNames.add(key);
      players.push(p);
    }

    const maxId = players.reduce((m, p) => Math.max(m, p.id), 0);
    const round = isObj(raw.round) ? raw.round : {};
    const lastEliminatedId = Number.isInteger(round.lastEliminatedId) && players.some(p => p.id === round.lastEliminatedId)
      ? round.lastEliminatedId
      : null;
    const eliminationStack = Array.isArray(round.eliminationStack)
      ? round.eliminationStack.filter(id => players.some(p => p.id === id))
      : (lastEliminatedId ? [lastEliminatedId] : []);

    const history = Array.isArray(raw.history) ? raw.history.slice(-200) : [];

    return {
      version: G.STATE_VERSION,
      betCents: G.isValidBet(raw.betCents) ? raw.betCents : base.betCents,
      betConfirmed: raw.betConfirmed === true,
      players,
      nextId: Math.max(toInt(raw.nextId, 1), maxId + 1),
      round: {
        number: Math.max(1, toInt(round.number, 1)),
        settlement: sanitizeSettlement(round.settlement, players),
        lastEliminatedId,
        eliminationStack
      },
      history
    };
  }

  /* ----------------------------------------------------------------
     Migration v1 -> v2
  ---------------------------------------------------------------- */
  function migrateLegacy(raw) {
    if (!isObj(raw)) return null;
    const betCents = G.parseBet(typeof raw.globalBet === 'number' ? raw.globalBet : '') || G.DEFAULT_BET_CENTS;

    const players = [];
    let id = 1;
    for (const lp of Array.isArray(raw.players) ? raw.players : []) {
      if (!isObj(lp)) continue;
      const lives = Math.min(G.MAX_LIVES, Math.max(0, toInt(lp.life, G.MAX_LIVES)));
      players.push({
        id: id++,
        name: lp.name,
        lives,
        eliminated: lives === 0,
        balanceCents: typeof lp.balance === 'number' ? Math.round(lp.balance * 100) : 0,
        lastAction: lp.lastAction,
        livesBeforeElimination: lives === 0 ? 1 : null
      });
    }

    const state = sanitizeState({
      betCents,
      betConfirmed: true,
      players,
      nextId: id,
      round: { number: 1, settlement: null }
    });

    const eliminated = state.players.filter(p => p.eliminated);
    if (eliminated.length > 0) {
      const lastElim = eliminated[eliminated.length - 1];
      state.round.lastEliminatedId = lastElim.id;
      state.round.eliminationStack = eliminated.map(p => p.id);
    }

    // v1 hat eine beendete Runde bereits ausgezahlt -> als (rückgängig machbare) Abrechnung abbilden
    const alive = state.players.filter(p => !p.eliminated);
    if (state.players.length >= 2 && alive.length === 1) {
      const deltas = {};
      let pot = 0;
      for (const p of state.players) {
        if (p.id === alive[0].id) continue;
        deltas[p.id] = -betCents;
        pot += betCents;
      }
      deltas[alive[0].id] = pot;
      state.round.settlement = { winnerId: alive[0].id, potCents: pot, betCents, deltas };
    }
    return state;
  }

  /* ----------------------------------------------------------------
     Öffentliche API
  ---------------------------------------------------------------- */
  function loadState(storage) {
    const current = sanitizeState(safeParse(safeGet(storage, STORAGE_KEY)));
    if (current) return current;
    const legacy = migrateLegacy(safeParse(safeGet(storage, LEGACY_KEY)));
    if (legacy) return legacy;
    return G.createInitialState();
  }

  function saveState(storage, state) {
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearState(storage) {
    if (!storage) return;
    for (const key of [STORAGE_KEY, LEGACY_KEY]) {
      try { storage.removeItem(key); } catch (e) { /* ignorieren */ }
    }
  }

  return Object.freeze({
    STORAGE_KEY, LEGACY_KEY,
    loadState, saveState, clearState, sanitizeState, migrateLegacy
  });
});
