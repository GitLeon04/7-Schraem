/* ------------------------------------------------------------------
   Globale Variablen und Daten
------------------------------------------------------------------ */
let players   = [];
let globalBet = 2.0;

const deathSounds = [
  'vine-boom.mp3',
  'metal-pipe-clang.mp3',
  'taco-bell-bong-sfx.mp3',
  'aughhhhh-aughhhhh.mp3',
  'better-call-saul-intro.mp3',
  'pimtopimati.mp3',
  'Fortnite-death-sound-effect.mp3'


];

const nicknames = {
  Leon:   'Flaschko',
  Philipp:'Eckmann',
  Lukas:  'Ansgar',
  Ilke:   'Ilkcross',
  Leon2:  'Tolj',
  Tim:    'Titan'
};

let currentAudio = null;

/* ------------------------------------------------------------------
   Audio
------------------------------------------------------------------ */
function playRandomDeathSound() {
  const file = deathSounds[Math.floor(Math.random() * deathSounds.length)];
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  currentAudio = new Audio(file);
  currentAudio.play();
}

/* ------------------------------------------------------------------
   Local‑Storage
------------------------------------------------------------------ */
function saveState() {
  localStorage.setItem(
    'lifetracker-state',
    JSON.stringify({ players, globalBet })
  );
}

function loadState() {
  const saved = localStorage.getItem('lifetracker-state');
  if (!saved) return;
  const data   = JSON.parse(saved);
  players      = data.players   || [];
  globalBet    = data.globalBet || 2.0;
  showPlayerForm();
  renderPlayers();
}

/* ------------------------------------------------------------------
   Einsatz festlegen
------------------------------------------------------------------ */
function setBet() {
  const input = document.getElementById('global-bet');
  const raw   = input.value.trim();
  const bet   = raw === '' ? 2.0 : parseFloat(raw);

  if (isNaN(bet) || bet <= 0) {
    input.classList.add('invalid');
    return;
  }
  input.classList.remove('invalid');
  globalBet = bet;
  showPlayerForm();
  renderPlayers();
  saveState();
}

/* ------------------------------------------------------------------
   Spieler hinzufügen / entfernen
------------------------------------------------------------------ */
function addPlayer() {
  const input = document.getElementById('player-name');
  const name  = input.value.trim();

  if (!name || players.some(p => p.name === name)) {
    input.classList.add('invalid');
    return;
  }
  input.classList.remove('invalid');
  createPlayer(name);
  input.value = '';
}

function createPlayer(name) {
  /* Doppelten Spieler blockieren */
  if (players.some(p => p.name === name)) return;

  const nickname = nicknames[name] || '';
  players.push({
    name,
    displayName: `${nickname} ${name}`.trim(),
    life: 7,
    eliminated: false,
    balance: 0,
    lastAction: null
  });

  /* Passenden Vorschlags‑Button deaktivieren */
  const btn = document.querySelector(`.preset-player[data-name="${name}"]`);
  if (btn) btn.disabled = true;

  renderPlayers();
  saveState();
}

function removePlayer(player) {
  players = players.filter(p => p.name !== player.name);

  /* Button wieder aktivieren, falls Name aus Vorschlägen stammt */
  const btn = document.querySelector(`.preset-player[data-name="${player.name}"]`);
  if (btn) btn.disabled = false;

  document.getElementById('winner').hidden = true;
  renderPlayers();
  saveState();
}

function getPlayerByName(name) {
  return players.find(p => p.name === name);
}

/* ------------------------------------------------------------------
   Leben verändern
------------------------------------------------------------------ */
function subtractLife(player, amount = 1) {
  if (player.eliminated) return;

  player.life       = Math.max(0, player.life - amount);
  player.lastAction = `-${amount}`;

  if (player.life === 0) {
    player.eliminated = true;
    playRandomDeathSound();
  }
  renderPlayers();
  checkWinner();
  saveState();
}

function addLife(player) {
  if (player.eliminated || player.life >= 7) return;

  player.life++;
  player.lastAction = '+1';
  renderPlayers();
  saveState();
}

/* ------------------------------------------------------------------
   Gewinner prüfen
------------------------------------------------------------------ */
function checkWinner() {
  const alive = players.filter(p => !p.eliminated);
  if (alive.length !== 1) return;

  const winner      = alive[0];
  const winnerIndex = players.findIndex(p => p.name === winner.name);
  const totalPot    = globalBet * (players.length - 1);

  players.forEach((p, i) => {
    if (i !== winnerIndex) p.balance -= globalBet;
  });
  players[winnerIndex].balance += totalPot;

  const div = document.getElementById('winner');
  div.hidden = false;
  div.innerHTML = `
    <h2>Gewinner: ${winner.displayName}</h2>
    <p>Er gewinnt €${totalPot.toFixed(2)} (Einsatz aller anderen Spieler)</p>
  `;

  renderPlayers();
  saveState();
}

/* ------------------------------------------------------------------
   Neustart & Reset
------------------------------------------------------------------ */
function restartGame() {
  if (!confirm('Spiel wirklich neu starten?')) return;

  players.forEach(p => {
    p.life       = 7;
    p.eliminated = false;
    p.lastAction = null;
  });
  document.getElementById('winner').hidden = true;
  renderPlayers();
  saveState();
}

function resetGame() {
  if (!confirm('Willst du wirklich alles löschen?')) return;

  localStorage.removeItem('lifetracker-state');
  players   = [];
  globalBet = 2.0;

  /* Vorschlags‑Buttons wieder aktivieren */
  document.querySelectorAll('.preset-player').forEach(b => b.disabled = false);

  document.getElementById('players').innerHTML = '';
  document.getElementById('winner').hidden      = true;
  document.getElementById('restart-button').hidden = true;
  document.getElementById('reset-button').hidden   = true;
  hidePlayerForm();
  document.getElementById('global-bet').value   = '';
}

/* ------------------------------------------------------------------
   Rendering
------------------------------------------------------------------ */
function renderPlayers() {
  const container = document.getElementById('players');
  container.innerHTML = '';

  players
    .slice()
    .sort((a, b) => a.eliminated - b.eliminated)
    .forEach(player => {
      const buttons = [];

      for (let i = 1; i <= 7; i++) {
        const active = player.lastAction === `-${i}` ? ' active' : '';
        buttons.push(
          `<button class="life-btn${active}" data-action="subtract" data-name="${player.name}" data-amount="${i}">-${i}</button>`
        );
      }

      const addActive = player.lastAction === '+1' ? ' active' : '';
      buttons.push(
        `<button class="life-btn${addActive}" data-action="add" data-name="${player.name}">+1</button>`
      );

      buttons.push(
        `<button data-action="remove" data-name="${player.name}">Entfernen</button>`
      );

      let classes = 'player';
      if (player.eliminated) classes += ' eliminated';
      else if (player.life === 1) classes += ' warning';

      const div = document.createElement('div');
      div.className = classes;
      div.innerHTML = `
        <strong>${player.displayName}</strong> |
        Leben: ${player.life} |
        Kontostand: ${player.balance >= 0 ? '+' : ''}€${player.balance.toFixed(2)}<br>
        ${player.eliminated ? '(eliminiert)' : buttons.join(' ')}
      `;
      container.appendChild(div);
    });

  const any = players.length > 0;
  document.getElementById('restart-button').hidden = !any;
  document.getElementById('reset-button').hidden   = !any;
}

/* ------------------------------------------------------------------
   Ein-/Ausklapp‑UI
------------------------------------------------------------------ */
const toggleBtn   = document.getElementById('toggle-player-ui');
const playerUIBox = document.getElementById('player-ui');

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    playerUIBox.hidden = !playerUIBox.hidden;
    toggleBtn.textContent = playerUIBox.hidden
      ? 'Aufklappen ▼'
      : 'Aufklappen ▲';
  });
}

function showPlayerForm() {
  document.getElementById('setup-form').style.display = 'none';
  toggleBtn.hidden   = false;
  playerUIBox.hidden = false;
}

function hidePlayerForm() {
  toggleBtn.hidden   = true;
  playerUIBox.hidden = true;
  document.getElementById('setup-form').style.display = 'block';
}

/* ------------------------------------------------------------------
   Initialisierung
------------------------------------------------------------------ */
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('set-bet-button' ).addEventListener('click', setBet);
  document.getElementById('add-player-button').addEventListener('click', addPlayer);
  document.getElementById('restart-button'   ).addEventListener('click', restartGame);
  document.getElementById('reset-button'     ).addEventListener('click', resetGame);

  document.querySelectorAll('.preset-player').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      if (!players.some(p => p.name === name)) {
        createPlayer(name);
        btn.disabled = true;           // sofort sperren
      }
    });
  });

  document.getElementById('players').addEventListener('click', e => {
    const btn = e.target;
    if (!btn.dataset.action) return;

    const player = getPlayerByName(btn.dataset.name);
    if (!player) return;

    if (btn.dataset.action === 'subtract') {
      subtractLife(player, parseInt(btn.dataset.amount, 10));
    } else if (btn.dataset.action === 'add') {
      addLife(player);
    } else if (btn.dataset.action === 'remove') {
      removePlayer(player);
    }
  });

  loadState();
});
