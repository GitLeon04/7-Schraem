/* ==================================================================
   7-Schräm – DOM-Anbindung
   ------------------------------------------------------------------
   Dünne Schicht: liest Eingaben, ruft die reine Logik auf, speichert,
   rendert neu und spielt Sounds. Keine Spiellogik in dieser Datei.
================================================================== */
(function () {
  'use strict';

  const G = window.SchraemGame;
  const S = window.SchraemStorage;
  const V = window.SchraemView;

  const storage = (function () {
    try { return window.localStorage; } catch (e) { return null; }
  })();

  let state = S.loadState(storage);
  let currentAudio = null;
  let lastSound = null;
  let toastTimer = null;
  let editingBet = false;

  const $ = id => document.getElementById(id);

  /* ----------------------------------------------------------------
     Audio
  ---------------------------------------------------------------- */
  function playDeathSound() {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      lastSound = G.pickDeathSound(Math.random, lastSound);
      currentAudio = new Audio(lastSound);
      const p = currentAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* Autoplay blockiert – egal */ });
    } catch (e) { /* Audio nicht verfügbar */ }
  }

  /* ----------------------------------------------------------------
     Feedback
  ---------------------------------------------------------------- */
  function toast(message, kind) {
    const el = $('toast');
    el.textContent = message;
    el.dataset.kind = kind || 'info';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  function markInvalid(input, invalid) {
    input.classList.toggle('invalid', invalid);
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  function confirmAction(title, text, confirmLabel) {
    const dlg = $('confirm-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') {
      return Promise.resolve(window.confirm(title + '\n\n' + text));
    }
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('confirm-ok').textContent = confirmLabel || 'Bestätigen';
    return new Promise(resolve => {
      const onClose = () => {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      };
      dlg.addEventListener('close', onClose);
      dlg.returnValue = '';
      dlg.showModal();
    });
  }

  /* ----------------------------------------------------------------
     State-Übergänge
  ---------------------------------------------------------------- */
  function apply(result) {
    if (!result.ok) {
      toast(V.errorMessage(result.error), 'error');
      return false;
    }
    state = result.state;
    if (!S.saveState(storage, state)) {
      toast('Spielstand konnte nicht gespeichert werden.', 'error');
    }
    for (const ev of result.events) handleEvent(ev);
    render();
    return true;
  }

  function nameOf(id) {
    const p = G.getPlayer(state, id);
    return p ? p.name : '';
  }

  /* ----------------------------------------------------------------
     Palantir Telemetry CLI Stream (Deko)
  ---------------------------------------------------------------- */
  const cliLogs = [];
  const MAX_CLI_LINES = 60;

  function pad(n, width) {
    return String(n).padStart(width || 2, '0');
  }

  function getTimestamp() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3);
  }

  function logCli(type, message, extra) {
    const time = getTimestamp();
    cliLogs.push({ time, type, message, extra: extra || '' });
    if (cliLogs.length > MAX_CLI_LINES) cliLogs.shift();
    renderCli();
  }

  function scrollCliToBottom() {
    const el = $('cli-output');
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        setTimeout(() => {
          el.scrollTop = el.scrollHeight;
        }, 0);
      });
    }
  }

  function renderCli() {
    const el = $('cli-output');
    if (!el) return;
    el.innerHTML = cliLogs.map(l => {
      let tagCls = 'cli-tag-info';
      if (l.type === 'CRIT' || l.type === 'ELIM') tagCls = 'cli-tag-crit';
      else if (l.type === 'WARN' || l.type === 'REVIVE') tagCls = 'cli-tag-warn';
      else if (l.type === 'SETTLE' || l.type === 'WIN') tagCls = 'cli-tag-win';
      else if (l.type === 'INIT' || l.type === 'BOOT') tagCls = 'cli-tag-init';

      return '<div class="cli-line">' +
        '<span class="cli-time">[' + l.time + ']</span> ' +
        '<span class="cli-tag ' + tagCls + '">[' + l.type + ']</span> ' +
        '<span class="cli-msg">' + V.escapeHtml(l.message) + '</span>' +
        (l.extra ? ' <span class="cli-extra">' + V.escapeHtml(l.extra) + '</span>' : '') +
      '</div>';
    }).join('');
    scrollCliToBottom();
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case 'eliminated':
        playDeathSound();
        logCli('CRIT', 'SYS::PLAYER_ELIMINATED -> target="' + nameOf(ev.playerId) + '"', 'stack_push=' + ev.playerId);
        break;
      case 'winner':
        toast(nameOf(ev.playerId) + ' gewinnt ' + G.formatCents(ev.potCents), 'success');
        logCli('SETTLE', 'SYS::ROUND_SETTLED -> winner="' + nameOf(ev.playerId) + '"', 'pot=' + G.formatCents(ev.potCents) + ' sum=0¢');
        break;
      case 'settlement-reversed':
        toast('Auszahlung zurückgebucht', 'info');
        logCli('WARN', 'SYS::SETTLEMENT_REVERSED -> pot_rescinded=' + G.formatCents(ev.potCents));
        break;
      case 'revived':
        toast(nameOf(ev.playerId) + ' ist zurück mit ' + ev.lives + ' Leben', 'success');
        logCli('REVIVE', 'SYS::REVIVE_EXEC -> target="' + nameOf(ev.playerId) + '"', 'lives=' + ev.lives);
        break;
      case 'player-added':
        logCli('INIT', 'SYS::PLAYER_REGISTER -> target="' + nameOf(ev.playerId) + '"', 'lives=' + G.MAX_LIVES);
        break;
      case 'player-removed':
        logCli('WARN', 'SYS::PLAYER_DEREGISTER -> id=' + ev.playerId);
        break;
      case 'round-started':
        logCli('INIT', 'SYS::ROUND_INCREMENT -> round=' + pad(ev.round), 'stack_cleared=TRUE');
        break;
      case 'restored':
        logCli('WARN', 'SYS::TIME_TRAVEL_RESTORE -> checkpoint=#' + ev.historyId, 'snapshot=LOADED');
        break;
    }
  }

  /* ----------------------------------------------------------------
     Rendering
  ---------------------------------------------------------------- */
  function render() {
    const betSet = state.betConfirmed;

    $('setup-form').hidden = betSet && !editingBet;
    $('cancel-bet-button').hidden = !editingBet;
    $('game').hidden = !betSet;
    if (betSet) scrollCliToBottom();

    $('stats').innerHTML = V.renderStats(state);
    $('players').innerHTML = V.renderPlayers(state);

    const winnerHtml = V.renderWinner(state);
    $('winner').innerHTML = winnerHtml;
    $('winner').hidden = !winnerHtml;

    const roundOver = G.isRoundOver(state);
    document.querySelectorAll('.preset-player').forEach(btn => {
      btn.disabled = roundOver || G.isNameTaken(state, btn.dataset.name);
    });
    $('player-name').disabled = roundOver;
    $('add-player-button').disabled = roundOver;

    const any = state.players.length > 0;
    $('restart-button').hidden = !any;
    $('restart-button').classList.toggle('btn-primary', roundOver);
    $('reset-button').hidden = !any && !betSet;

    $('round-label').textContent = 'Runde ' + String(state.round.number).padStart(2, '0');

    const logCountEl = $('log-count');
    if (logCountEl) {
      logCountEl.textContent = Array.isArray(state.history) ? state.history.length : 0;
    }
    const logDlg = $('log-dialog');
    if (logDlg && logDlg.open) {
      const logEntries = $('log-entries');
      if (logEntries) logEntries.innerHTML = V.renderHistoryLog(state);
    }
  }

  /* ----------------------------------------------------------------
     Handler
  ---------------------------------------------------------------- */
  function onSetBet(e) {
    e.preventDefault();
    const input = $('global-bet');
    const cents = G.parseBet(input.value);
    if (cents === null) {
      markInvalid(input, true);
      toast(V.errorMessage('invalid-bet'), 'error');
      input.focus();
      return;
    }
    markInvalid(input, false);
    const wasEditing = editingBet;
    editingBet = false;
    if (apply(G.setBet(state, cents))) {
      input.value = '';
      if (wasEditing) toast('Einsatz: ' + G.formatCents(cents), 'info');
      else $('player-name').focus();
    }
  }

  function onEditBet() {
    editingBet = true;
    render();
    const input = $('global-bet');
    input.value = G.formatBetInput(state.betCents);
    input.focus();
    input.select();
  }

  function onCancelBet() {
    editingBet = false;
    $('global-bet').value = '';
    markInvalid($('global-bet'), false);
    render();
  }
  function onAddPlayer(e) {
    e.preventDefault();
    const input = $('player-name');
    const result = G.addPlayer(state, input.value);
    markInvalid(input, !result.ok);
    if (apply(result)) {
      input.value = '';
      input.focus();
    }
  }

  async function onPlayersClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const id = parseInt(btn.dataset.id, 10);

    switch (btn.dataset.action) {
      case 'subtract':
        logCli('EVENT', 'SYS::DELTA_LIFE -> target="' + nameOf(id) + '" delta=-' + btn.dataset.amount);
        apply(G.subtractLife(state, id, parseInt(btn.dataset.amount, 10)));
        break;
      case 'add':
        logCli('EVENT', 'SYS::DELTA_LIFE -> target="' + nameOf(id) + '" delta=+1');
        apply(G.addLife(state, id));
        break;
      case 'revive':
        apply(G.revivePlayer(state, id));
        break;
      case 'remove':
        if (await confirmAction('Spieler entfernen?', nameOf(id) + ' wird aus dem Spiel entfernt. Der Kontostand geht verloren.', 'Entfernen')) {
          apply(G.removePlayer(state, id));
        }
        break;
    }
  }

  async function onRestart() {
    const msg = G.isRoundOver(state)
      ? 'Alle Spieler starten wieder mit ' + G.MAX_LIVES + ' Leben. Kontostände bleiben erhalten.'
      : 'Die aktuelle Runde hat noch keinen Sieger. Trotzdem neu starten? Es wird nichts ausgezahlt.';
    if (await confirmAction('Nächste Runde starten?', msg, 'Starten')) {
      apply(G.nextRound(state));
    }
  }

  async function onReset() {
    if (!(await confirmAction('Alles zurücksetzen?', 'Alle Spieler, Kontostände und der Einsatz werden gelöscht.', 'Alles löschen'))) return;
    S.clearState(storage);
    state = G.resetGame();
    $('global-bet').value = '';
    $('player-name').value = '';
    markInvalid($('global-bet'), false);
    markInvalid($('player-name'), false);
    editingBet = false;
    $('player-ui').hidden = false;
    $('toggle-player-ui').setAttribute('aria-expanded', 'true');
    $('toggle-player-ui').querySelector('.toggle-label').textContent = 'Ausblenden';
    render();
    toast('Zurückgesetzt', 'info');
  }

  function onTogglePlayerUi() {
    const box = $('player-ui');
    box.hidden = !box.hidden;
    $('toggle-player-ui').setAttribute('aria-expanded', String(!box.hidden));
    $('toggle-player-ui').querySelector('.toggle-label').textContent = box.hidden ? 'Einblenden' : 'Ausblenden';
  }

  function onOpenLog() {
    const dlg = $('log-dialog');
    if (!dlg) return;
    const entries = $('log-entries');
    if (entries) entries.innerHTML = V.renderHistoryLog(state);
    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  function onCloseLog() {
    const dlg = $('log-dialog');
    if (!dlg) return;
    if (typeof dlg.close === 'function') {
      dlg.close();
    } else {
      dlg.removeAttribute('open');
    }
  }

  async function onLogClick(e) {
    const btn = e.target.closest('button[data-action="restore"]');
    if (!btn || btn.disabled) return;
    const histId = parseInt(btn.dataset.historyId, 10);
    if (!histId) return;

    const confirmed = await confirmAction(
      'Spielstand wiederherstellen?',
      'Möchtest du zu diesem Schritt (#' + histId + ') zurückkehren? Der aktuelle Stand wird im Protokoll gesichert.',
      'Wiederherstellen'
    );
    if (confirmed) {
      if (apply(G.restoreHistory(state, histId))) {
        toast('Stand #' + histId + ' wiederhergestellt', 'success');
        onCloseLog();
      }
    }
  }

  function loadLastDeploy() {
    const el = $('last-deploy');
    if (!el || typeof fetch !== 'function') return;
    fetch('https://api.github.com/repos/GitLeon04/7-Schraem/commits?per_page=1')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then(data => {
        const date = data && data[0] && data[0].commit && data[0].commit.committer && data[0].commit.committer.date;
        if (!date) throw new Error('no date');
        el.textContent = 'Letztes Deployment · ' + new Date(date).toLocaleString('de-DE');
      })
      .catch(() => { el.textContent = 'Letztes Deployment · unbekannt'; });
  }

  /* ----------------------------------------------------------------
     Init
  ---------------------------------------------------------------- */
  function init() {
    $('setup-form').addEventListener('submit', onSetBet);
    $('cancel-bet-button').addEventListener('click', onCancelBet);
    $('edit-bet-button').addEventListener('click', onEditBet);
    $('player-form').addEventListener('submit', onAddPlayer);
    $('players').addEventListener('click', onPlayersClick);
    $('restart-button').addEventListener('click', onRestart);
    $('reset-button').addEventListener('click', onReset);
    $('toggle-player-ui').addEventListener('click', onTogglePlayerUi);

    $('open-log-button').addEventListener('click', onOpenLog);
    $('close-log-button').addEventListener('click', onCloseLog);
    $('log-entries').addEventListener('click', onLogClick);
    $('log-dialog').addEventListener('click', e => {
      if (e.target === $('log-dialog')) onCloseLog();
    });

    $('global-bet').addEventListener('input', e => markInvalid(e.target, false));
    $('player-name').addEventListener('input', e => markInvalid(e.target, false));
    $('player-name').maxLength = G.MAX_NAME_LENGTH;

    document.querySelectorAll('.preset-player').forEach(btn => {
      btn.addEventListener('click', () => apply(G.addPlayer(state, btn.dataset.name)));
    });

    // Migrierten / reparierten Stand direkt im neuen Format sichern
    S.saveState(storage, state);
    if (state.players.length > 0) {
      $('player-ui').hidden = true;
      $('toggle-player-ui').setAttribute('aria-expanded', 'false');
      $('toggle-player-ui').querySelector('.toggle-label').textContent = 'Einblenden';
    }
    render();
    loadLastDeploy();

    if (typeof ResizeObserver !== 'undefined') {
      const cliEl = $('cli-output');
      if (cliEl) {
        new ResizeObserver(() => {
          scrollCliToBottom();
        }).observe(cliEl);
      }
    }

    logCli('BOOT', 'KERNEL_INIT: Palantir Schraem-OS v2.4.9 (x86_64-palantir-linux-gnu)');
    logCli('INIT', 'SUBSYSTEM_LEDGER: Zero-Sum Ledger mounted', 'checksum=0x7E01 sum=0¢');
    logCli('INIT', 'SUBSYSTEM_AUDIO: Psychoacoustic sound matrix online', '8_channels');
    logCli('INIT', 'SUBSYSTEM_STACK: LIFO elimination enforcement enabled');
    if (state.betConfirmed) {
      logCli('INFO', 'SESSION_RESTORED: Bet=' + G.formatCents(state.betCents), 'active_players=' + state.players.length);
    }
    scrollCliToBottom();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
