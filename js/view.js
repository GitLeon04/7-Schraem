/* ==================================================================
   7-Schräm – Rendering
   ------------------------------------------------------------------
   Erzeugt HTML-Strings aus dem State. Alle Benutzereingaben werden
   escaped; Buttons referenzieren Spieler über numerische IDs.
================================================================== */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./game.js') : root.SchraemGame
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchraemView = api;
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  const ERROR_MESSAGES = {
    'empty-name':     'Bitte einen Namen eingeben.',
    'duplicate-name': 'Diesen Spieler gibt es bereits.',
    'name-too-long':  'Name ist zu lang (max. ' + G.MAX_NAME_LENGTH + ' Zeichen).',
    'invalid-bet':    'Ungültiger Einsatz. Beispiel: 2 oder 2,50',
    'bet-not-set':    'Bitte zuerst den Einsatz festlegen.',
    'round-over':     'Runde ist beendet. Starte die nächste Runde oder nutze Revive.',
    'max-lives':      'Maximale Leben bereits erreicht.',
    'eliminated':     'Spieler ist ausgeschieden. Nutze Revive.',
    'not-found':      'Spieler nicht gefunden.',
    'no-players':     'Keine Spieler vorhanden.',
    'not-eliminated': 'Spieler ist nicht ausgeschieden.',
    'invalid-amount': 'Ungültiger Wert.'
  };

  function errorMessage(code) {
    return ERROR_MESSAGES[code] || 'Aktion nicht möglich.';
  }

  /* ----------------------------------------------------------------
     Spielerkarte
  ---------------------------------------------------------------- */
  function renderPips(lives) {
    let html = '';
    for (let i = 1; i <= G.MAX_LIVES; i++) {
      html += i <= lives ? '<span class="pip on"></span>' : '<span class="pip"></span>';
    }
    return '<div class="pips" aria-hidden="true">' + html + '</div>';
  }

  function renderControls(player, roundOver) {
    const id = player.id;
    const dis = roundOver ? ' disabled' : '';

    if (player.eliminated) {
      return '<div class="controls controls-revive">' +
        '<button type="button" class="btn btn-revive" data-action="revive" data-id="' + id + '">' +
        '<span class="btn-icon" aria-hidden="true">↺</span> Revive' +
        '</button></div>';
    }

    let html = '<div class="controls">';
    for (let i = 1; i <= G.MAX_LIVES; i++) {
      const active = player.lastAction === '-' + i ? ' is-active' : '';
      html += '<button type="button" class="life-btn' + active + '" data-action="subtract" data-id="' + id +
        '" data-amount="' + i + '" aria-label="' + i + ' Leben abziehen"' + dis + '>−' + i + '</button>';
    }
    const addActive = player.lastAction === '+1' ? ' is-active' : '';
    const addDis = roundOver || player.lives >= G.MAX_LIVES ? ' disabled' : '';
    html += '<button type="button" class="life-btn life-btn-add' + addActive + '" data-action="add" data-id="' + id +
      '" aria-label="Ein Leben hinzufügen"' + addDis + '>+1</button>';
    return html + '</div>';
  }

  function statusOf(player, state) {
    const winner = G.getWinner(state);
    if (winner && winner.id === player.id) return { cls: 'is-winner', label: 'Sieger' };
    if (player.eliminated) return { cls: 'is-eliminated', label: 'Ausgeschieden' };
    if (player.lives === 1) return { cls: 'is-warning', label: 'Letztes Leben' };
    return { cls: '', label: 'Aktiv' };
  }

  function renderPlayerCard(player, state) {
    const roundOver = G.isRoundOver(state);
    const status = statusOf(player, state);
    const index = state.players.findIndex(p => p.id === player.id) + 1;
    const balanceCls = player.balanceCents > 0 ? 'pos' : player.balanceCents < 0 ? 'neg' : '';

    const remove = roundOver ? '' :
      '<button type="button" class="icon-btn" data-action="remove" data-id="' + player.id +
      '" aria-label="' + escapeHtml(player.name) + ' entfernen" title="Spieler entfernen">×</button>';

    return '' +
      '<article class="card ' + status.cls + '" data-id="' + player.id + '">' +
        '<header class="card-head">' +
          '<span class="card-index">' + pad2(index) + '</span>' +
          '<h3 class="player-name">' + escapeHtml(player.name) + '</h3>' +
          '<span class="card-status">' + status.label + '</span>' +
          remove +
        '</header>' +
        '<div class="card-body">' +
          '<div class="lives"><span class="lives-count">' + player.lives + '</span>' +
            '<span class="lives-max">/' + G.MAX_LIVES + '</span></div>' +
          renderPips(player.lives) +
          '<div class="balance"><span class="label">Konto</span>' +
            '<span class="balance-value ' + balanceCls + '">' +
            G.formatCents(player.balanceCents, { sign: true }) + '</span></div>' +
        '</div>' +
        renderControls(player, roundOver) +
      '</article>';
  }

  function renderPlayers(state) {
    if (state.players.length === 0) {
      return '<div class="empty"><span class="label">Keine Spieler</span>' +
        '<p>Füge oben Spieler hinzu, um die Runde zu starten.</p></div>';
    }
    return G.getSortedPlayers(state).map(p => renderPlayerCard(p, state)).join('');
  }

  /* ----------------------------------------------------------------
     Gewinner & Kennzahlen
  ---------------------------------------------------------------- */
  function renderWinner(state) {
    const winner = G.getWinner(state);
    if (!winner) return '';
    return '' +
      '<div class="winner-inner">' +
        '<span class="label">Runde ' + pad2(state.round.number) + ' · Ergebnis</span>' +
        '<h2 class="winner-name">' + escapeHtml(winner.name) + '</h2>' +
        '<p class="winner-pot">gewinnt <strong>' + G.formatCents(state.round.settlement.potCents) +
        '</strong> aus den Einsätzen aller anderen Spieler.</p>' +
        '<p class="winner-hint">Versehentlich eliminiert? Nutze <em>Revive</em> – die Auszahlung wird automatisch zurückgebucht.</p>' +
      '</div>';
  }

  function stat(label, value) {
    return '<div class="stat"><span class="label">' + label + '</span><span class="stat-value">' + value + '</span></div>';
  }

  function renderStats(state) {
    const alive = G.getAlivePlayers(state).length;
    return stat('Runde', pad2(state.round.number)) +
      stat('Einsatz', G.formatCents(state.betCents)) +
      stat('Im Spiel', alive + '/' + state.players.length) +
      stat('Pot', G.formatCents(G.getPotCents(state)));
  }

  return Object.freeze({
    escapeHtml, errorMessage,
    renderPlayerCard, renderPlayers, renderWinner, renderStats
  });
});

