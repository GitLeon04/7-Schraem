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

function playRandomDeathSound() {
  const file = deathSounds[Math.floor(Math.random() * deathSounds.length)];
  const audio = new Audio(file);
  audio.play();
}

function setBet() {
  const betInput = document.getElementById('global-bet');
  const bet = parseFloat(betInput.value);

  if (!isNaN(bet) && bet > 0) {
    globalBet = bet;
  }

  document.getElementById('player-form').style.display = 'block';
  document.getElementById('preset-buttons').style.display = 'block';
  document.getElementById('setup-form').style.display = 'none';
}

function addPlayer() {
  const nameInput = document.getElementById('player-name');
  const name = nameInput.value.trim();
  if (!name) {
    alert("Bitte einen Spielernamen eingeben.");
    return;
  }
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
}

function addLife(index) {
  const player = players[index];
  if (player.eliminated) return;
  if (player.life >= 7) return;

  player.life++;
  renderPlayers();
}

function removePlayer(index) {
  players.splice(index, 1);
  document.getElementById('winner').style.display = 'none';
  renderPlayers();
}

function renderPlayers(showFinalBalance = false, winnerIndex = null) {
  const container = document.getElementById('players');
  container.innerHTML = '';

  players.forEach((player, index) => {
    let displayBalance = player.balance;
    if (showFinalBalance) {
      if (index === winnerIndex) {
        const losers = players.length - 1;
        displayBalance += globalBet * losers;
      } else {
        displayBalance -= globalBet;
      }
    }

    const subtractButtons = [];
    for (let i = 1; i <= 7; i++) {
      subtractButtons.push(`<button onclick="subtractLife(${index}, ${i})">-${i}</button>`);
    }

    const playerDiv = document.createElement('div');
    playerDiv.className = 'player' + (player.eliminated ? ' eliminated' : '');
    playerDiv.innerHTML = `
      <strong>${player.name}</strong> |
      Leben: ${player.life} |
      Kontostand: ${displayBalance >= 0 ? '+' : ''}€${displayBalance.toFixed(2)}<br>
      ${!player.eliminated ? subtractButtons.join(' ') : ' (eliminiert)'} 
      ${!player.eliminated ? `<button onclick="addLife(${index})">+1</button>` : ''}
      <button onclick="removePlayer(${index})">Entfernen</button>
    `;
    container.appendChild(playerDiv);
  });

  document.getElementById('restart-button').style.display = players.length > 0 ? 'inline-block' : 'none';
}

function checkWinner() {
  const alive = players.filter(p => !p.eliminated);
  if (alive.length === 1) {
    const winner = alive[0];
    const winnerIndex = players.indexOf(winner);
    const totalPot = globalBet * (players.length - 1);

    players.forEach((p, i) => {
      if (i !== winnerIndex) {
        p.balance -= globalBet;
      }
    });

    players[winnerIndex].balance += totalPot;

    renderPlayers(true, winnerIndex);

    const winnerDiv = document.getElementById('winner');
    winnerDiv.style.display = 'block';
    winnerDiv.innerHTML = `
      <h2>Gewinner: ${winner.name}</h2>
      <p>Er gewinnt €${totalPot.toFixed(2)} (Einsatz aller anderen Spieler)</p>
    `;
  }
}

function restartGame() {
  players.forEach(p => {
    p.life = 7;
    p.eliminated = false;
  });

  document.getElementById('winner').style.display = 'none';
  renderPlayers();
}
