let players = [];
let globalBet = 0.5;

const deathSounds = [
  "vine-boom.mp3",
  "metal-pipe-clang.mp3",
  "taco-bell-bong-sfx.mp3",
  "aughhhhh-aughhhhh.mp3",
  "better-call-saul-intro.mp3",
  "heheheha.mp3"
];

// ----- LocalStorage -----

function saveState() {
  const data = {
    players,
    globalBet
  };
  localStorage.setItem("lifetracker-state", JSON.stringify(data));
}

function loadState() {
  const saved = localStorage.getItem("lifetracker-state");
  if (!saved) return;
  const data = JSON.parse(saved);
  players = data.players || [];
  globalBet = data.globalBet || 0.5;
  document.getElementById('setup-form').style.display = 'none';
  document.getElementById('player-form').style.display = 'block';
  document.getElementById('preset-buttons').style.display = 'block';
  renderPlayers();
}

function resetGame() {
  localStorage.removeItem("lifetracker-state");
  players = [];
  globalBet = 0.5;
  document.getElementById('players').innerHTML = '';
  document.getElementById('winner').style.display = 'none';
  document.getElementById('player-form').style.display = 'none';
  document.getElementById('preset-buttons').style.display = 'none';
  document.getElementById('setup-form').style.display = 'block';
  document.getElementById('restart-button').style.display = 'none';
  document.getElementById('reset-button').style.display = 'none';
  document.getElementById('global-bet').value = '';
}

// ----- Sound -----

let currentAudio = null;

function playRandomDeathSound() {
  const file = deathSounds[Math.floor(Math.random() * deathSounds.length)];
  
  // vorherigen Sound stoppen, wenn aktiv
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  currentAudio = new Audio(file);
  currentAudio.play();
}


// ----- Setup -----

function setBet() {
  const betInput = document.getElementById('global-bet');
  const bet = parseFloat(betInput.value);
  if (!isNaN(bet) && bet > 0) {
    globalBet = bet;
  }

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

  players.push({
    name,
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

// ----- Anzeige & Logik -----

function renderPlayers() {
  const container = document.getElementById('players');
  container.innerHTML = '';

  players.forEach((player, index) => {
    const balance = player.balance;
    const subtractButtons = Array.from({ length: 7 }, (_, i) =>
      `<button onclick="subtractLife(${index}, ${i + 1})">-${i + 1}</button>`).join(' ');

    const playerDiv = document.createElement('div');
    playerDiv.className = 'player' + (player.eliminated ? ' eliminated' : '');
    playerDiv.innerHTML = `
      <strong>${player.name}</strong> |
      Leben: ${player.life} |
      Kontostand: ${balance >= 0 ? '+' : ''}€${balance.toFixed(2)}<br>
      ${!player.eliminated ? subtractButtons : ' (eliminiert)'} 
      ${!player.eliminated ? `<button onclick="addLife(${index})">+1</button>` : ''}
      <button onclick="removePlayer(${index})">Entfernen</button>
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
    <h2>Gewinner: ${winner.name}</h2>
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

// ----- Autostart -----
window.onload = loadState;
