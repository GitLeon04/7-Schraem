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
  "Tolj": "Tolj",
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
  const data = { players, globalBet };
  localStorage.setItem("lifetracker-state", JSON.stringify(data));
}

function loadState() {
  const saved = localStorage.getItem("lifetracker-state");
  if (!saved) return;
  const data = JSON.parse(saved);
  players = data.players || [];
  globalBet = data.globalBet || 2.0;
  document.getElementById('setup-form').style.display = 'none';
  document.getElementById('player-form').style.display = 'block';
  document.getElementById('preset-buttons').style.display = 'block';
  renderPlayers();
}

function resetGame() {
  localStorage.removeItem("lifetracker-state");
  players = [];
  globalBet = 2.0;
  document.getElementById('players').innerHTML = '';
  document.getElementById('winner').style.display = 'none';
  document.getElementById('player-form').style.display = 'none';
  document.getElementById('preset-buttons').style.display = 'none';
  document.getElementById('setup-form').style.display = 'block';
  document.getElementById('restart-button').style.display = 'none';
  document.getElementById('reset-button').style.display = 'none';
  document.getElementById('global-bet').value = '';
}

function setBet() {
  const betInput = document.getElementById('global-bet');
  const raw = betInput.value.trim();
  const bet = raw === '' ? 2.0 : parseFloat(raw);
  if (isNaN(bet) || bet <= 0) {
    alert("Bitte gib einen gültigen Einsatz größer als 0 ein.");
    return;
  }
  globalBet = bet;
  document.getElementById('player-form').style.display = 'block';
  document.getElementById('preset-buttons').style.display = 'block';
  document.getElementById('setup-form').style.display = 'none';
  renderPlayers();
  saveState();
}

function addPlayer() {
  const nameInput = document.getElementById('player-name');
  const name = nameInput.value.trim();
  if (!name) return;
  createPlayer(name);
  nameInput.value = '';
}

function addPresetPlayer(name) {
  createPlayer(name);
}

function createPlayer(name) {
  if (players.some(p => p.name === name)) {
    alert(`Spieler "${name}" existiert bereits.`);
    return;
  }
  const nickname = nicknames[name] || '';
  players.push({
    name,
    displayName: `${nickname} ${name}`,
    life: 7,
    eliminated: false,
    balance: 0
  });
  renderPlayers();
  saveState();
}

function subtractLife(index, amount = 1) {
  const player = players[index];
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

function addLife(index) {
  const player = players[index];
  if (player.eliminated || player.life >= 7) return;
  player.life++;
  renderPlayers();
  saveState();
}

function removePlayer(index) {
  players.splice(index, 1);
  document.getElementById('winner').style.display = 'none';
  renderPlayers();
  saveState();
}

function renderPlayers() {
  const container = document.getElementById('players');
  container.innerHTML = '';

  players.forEach((player, index) => {
    const balance = player.balance;
    const buttons = [];

    for (let i = 1; i <= 7; i++) {
      buttons.push(`<button onclick="subtractLife(${index}, ${i})">-${i}</button>`);
    }

    buttons.push(`<button onclick="addLife(${index})">+1</button>`);
    buttons.push(`<button onclick="removePlayer(${index})">Entfernen</button>`);

    let playerClass = 'player';
    if (player.eliminated) playerClass += ' eliminated';
    else if (player.life === 1) playerClass += ' warning';

    const playerDiv = document.createElement('div');
    playerDiv.className = playerClass;
    playerDiv.innerHTML = `
      <strong>${player.displayName}</strong> |
      Leben: ${player.life} |
      Kontostand: ${balance >= 0 ? '+' : ''}€${balance.toFixed(2)}<br>
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
  const winnerIndex = players.indexOf(winner);
  const totalPot = globalBet * (players.length - 1);

  players.forEach((p, i) => {
    if (i !== winnerIndex) {
      p.balance -= globalBet;
    }
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
  players.forEach(p => {
    p.life = 7;
    p.eliminated = false;
  });

  document.getElementById('winner').style.display = 'none';
  renderPlayers();
  saveState();
}

window.onload = loadState;
