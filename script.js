let players = [];
let globalBet = 2.0;

const deathSounds = [
  "vine-boom.mp3",
  "metal-pipe-clang.mp3",
  "taco-bell-bong-sfx.mp3",
  "aughhhhh-aughhhhh.mp3",
  "better-call-saul-intro.mp3",
  "heheheha.mp3"
];

const nicknames = {
  "Leon": "Flaschko",
  "Philipp": "Eckmann",
  "Lukas": "Ansgar",
  "Ilke": "Ilkcross",
  "Leon2": "Tolj",
  "Tim": "Titan"
};

let currentAudio = null;

function playRandomDeathSound() {
  const file = deathSounds[Math.floor(Math.random() * deathSounds.length)];
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  currentAudio = new Audio(file);
  currentAudio.play();
}

function saveState() {
  localStorage.setItem("lifetracker-state", JSON.stringify({ players, globalBet }));
}

function loadState() {
  const saved = localStorage.getItem("lifetracker-state");
  if (!saved) return;
  const data = JSON.parse(saved);
  players = data.players || [];
  globalBet = data.globalBet || 2.0;
  showPlayerForm();
  renderPlayers();
}

function resetGame() {
  if (!confirm("Willst du wirklich alles löschen?")) return;
  localStorage.removeItem("lifetracker-state");
  players = [];
  globalBet = 2.0;
  document.getElementById('players').innerHTML = '';
  document.getElementById('winner').style.display = 'none';
  hidePlayerForm();
  document.getElementById('global-bet').value = '';
}

function setBet() {
  const betInput = document.getElementById('global-bet');
  const raw = betInput.value.trim();
  const bet = raw === '' ? 2.0 : parseFloat(raw);
  if (isNaN(bet) || bet <= 0) {
    betInput.classList.add("invalid");
    return;
  }
  betInput.classList.remove("invalid");
  globalBet = bet;
  showPlayerForm();
  renderPlayers();
  saveState();
}

function addPlayer() {
  const nameInput = document.getElementById('player-name');
  const name = nameInput.value.trim();
  if (!name || players.some(p => p.name === name)) {
    nameInput.classList.add("invalid");
    return;
  }
  nameInput.classList.remove("invalid");
  createPlayer(name);
  nameInput.value = '';
}

function createPlayer(name) {
  const nickname = nicknames[name] || '';
  players.push({
    name,
    displayName: `${nickname} ${name}`.trim(),
    life: 7,
    eliminated: false,
    balance: 0
  });
  renderPlayers();
  saveState();
}

function subtractLife(player, amount = 1) {
  if (player.eliminated) return;
  player.life = Math.max(0, player.life - amount);
  if (player.life === 0 && !player.eliminated) {
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
  renderPlayers();
  saveState();
}

function removePlayer(player) {
  players = players.filter(p => p.name !== player.name);
  document.getElementById('winner').style.display = 'none';
  renderPlayers();
  saveState();
}

function getPlayerByName(name) {
  return players.find(p => p.name === name);
}

function renderPlayers() {
  const container = document.getElementById('players');
  container.innerHTML = '';

  players
    .slice()
    .sort((a, b) => a.eliminated - b.eliminated)
    .forEach((player) => {
      const buttons = [];

      for (let i = 1; i <= 7; i++) {
        buttons.push(`<button data-action="subtract" data-name="${player.name}" data-amount="${i}">-${i}</button>`);
      }

      buttons.push(`<button data-action="add" data-name="${player.name}">+1</button>`);
      buttons.push(`<button data-action="remove" data-name="${player.name}">Entfernen</button>`);

      let playerClass = 'player';
      if (player.eliminated) playerClass += ' eliminated';
      else if (player.life === 1) playerClass += ' warning';

      const playerDiv = document.createElement('div');
      playerDiv.className = playerClass;
      playerDiv.innerHTML = `
        <strong>${player.displayName}</strong> |
        Leben: ${player.life} |
        Kontostand: ${player.balance >= 0 ? '+' : ''}€${player.balance.toFixed(2)}<br>
        ${!player.eliminated ? buttons.join(' ') : ' (eliminiert)'}
      `;
      container.appendChild(playerDiv);
    });

  const hasPlayers = players.length > 0;
  document.getElementById('restart-button').style.display = hasPlayers ? 'inline-block' : 'none';
  document.getElementById('reset-button').style.display = hasPlayers ? 'inline-block' : 'none';
}

function checkWinner() {
  const alive = players.filter(p => !p.eliminated);
  if (alive.length !== 1) return;

  const winner = alive[0];
  const winnerIndex = players.findIndex(p => p.name === winner.name);
  const totalPot = globalBet * (players.length - 1);

  players.forEach((p, i) => {
    if (i !== winnerIndex) p.balance -= globalBet;
  });

  players[winnerIndex].balance += totalPot;

  const winnerDiv = document.getElementById('winner');
  winnerDiv.style.display = 'block';
  winnerDiv.innerHTML = `
    <h2>Gewinner: ${winner.displayName}</h2>
    <p>Er gewinnt €${totalPot.toFixed(2)} (Einsatz aller anderen Spieler)</p>
  `;

  renderPlayers();
  saveState();
}

function restartGame() {
  if (!confirm("Spiel wirklich neu starten?")) return;
  players.forEach(p => {
    p.life = 7;
    p.eliminated = false;
  });
  document.getElementById('winner').style.display = 'none';
  renderPlayers();
  saveState();
}

function showPlayerForm() {
  document.getElementById('setup-form').style.display = 'none';
  document.getElementById('player-form').style.display = 'block';
  document.getElementById('preset-buttons').style.display = 'block';
}

function hidePlayerForm() {
  document.getElementById('player-form').style.display = 'none';
  document.getElementById('preset-buttons').style.display = 'none';
  document.getElementById('setup-form').style.display = 'block';
}

// Event Listeners
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('set-bet-button').addEventListener('click', setBet);
  document.getElementById('add-player-button').addEventListener('click', addPlayer);
  document.getElementById('restart-button').addEventListener('click', restartGame);
  document.getElementById('reset-button').addEventListener('click', resetGame);

  document.querySelectorAll('.preset-player').forEach(btn => {
    btn.addEventListener('click', () => createPlayer(btn.dataset.name));
  });

  document.getElementById('players').addEventListener('click', (e) => {
    const btn = e.target;
    if (!btn.dataset.action) return;

    const name = btn.dataset.name;
    const player = getPlayerByName(name);
    if (!player) return;

    if (btn.dataset.action === "subtract") {
      subtractLife(player, parseInt(btn.dataset.amount));
    } else if (btn.dataset.action === "add") {
      addLife(player);
    } else if (btn.dataset.action === "remove") {
      removePlayer(player);
    }
  });

  loadState();
});
