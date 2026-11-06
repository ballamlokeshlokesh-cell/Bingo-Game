(() => {
  // --- SOUND EFFECTS (Web Audio API - Zero External Dependencies) ---
  let audioCtx = null;
  let soundEnabled = localStorage.getItem('bingo_sound') !== 'false';

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1) {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio playback error', e);
    }
  }

  function playCallSound() {
    playTone(523.25, 'triangle', 0.12, 0.15); // C5
    setTimeout(() => playTone(659.25, 'triangle', 0.18, 0.15), 100); // E5
  }

  function playTurnAlertSound() {
    playTone(440, 'sine', 0.1, 0.12);
    setTimeout(() => playTone(880, 'sine', 0.2, 0.12), 120);
  }

  function playLineCompletedSound() {
    playTone(587.33, 'triangle', 0.15, 0.2); // D5
    setTimeout(() => playTone(783.99, 'triangle', 0.15, 0.2), 120); // G5
    setTimeout(() => playTone(1046.50, 'triangle', 0.3, 0.2), 240); // C6
  }

  function playVictorySound() {
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'triangle', 0.25, 0.25), idx * 140);
    });
  }

  // --- STATE ---
  const state = {
    username: localStorage.getItem('bingo_username') || '',
    avatarColor: localStorage.getItem('bingo_avatar_color') || '#6366f1',
    currentRoom: null,
    isHost: false,
    matrixSize: 25,
    winLines: 5,
    myBoard: [],
    calledNumbers: [],
    turnOrder: [],
    currentTurnPlayer: null,
    completedLines: [],
    gameActive: false
  };

  const socket = io();

  // --- DOM ELEMENTS ---
  const views = {
    onboarding: document.getElementById('view-onboarding'),
    hub: document.getElementById('view-hub'),
    lobby: document.getElementById('view-lobby'),
    game: document.getElementById('view-game')
  };

  // Header Elements
  const headerAvatar = document.getElementById('header-avatar');
  const headerUsername = document.getElementById('header-username');
  const userPill = document.getElementById('user-pill');
  const changeUserBtn = document.getElementById('change-user-btn');
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const soundIcon = document.getElementById('sound-icon');
  const leaderboardBtn = document.getElementById('leaderboard-btn');
  const rulesBtn = document.getElementById('rules-btn');
  const brandLogo = document.getElementById('brand-logo');

  // Onboarding
  const onboardingForm = document.getElementById('onboarding-form');
  const inputUsername = document.getElementById('input-username');
  const avatarPalette = document.getElementById('avatar-palette');

  // Hub
  const hubGreetingName = document.getElementById('hub-greeting-name');
  const createRoomForm = document.getElementById('create-room-form');
  const joinRoomForm = document.getElementById('join-room-form');
  const inputTeamCode = document.getElementById('input-team-code');
  const matrixCardOptions = document.querySelectorAll('.matrix-card-option');
  const selectWinLines = document.getElementById('select-win-lines');

  // Lobby
  const lobbyTeamCode = document.getElementById('lobby-team-code');
  const copyCodeBtn = document.getElementById('copy-code-btn');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const lobbyMatrixSize = document.getElementById('lobby-matrix-size');
  const lobbyWinGoal = document.getElementById('lobby-win-goal');
  const lobbyHostName = document.getElementById('lobby-host-name');
  const lobbyHostName2 = document.getElementById('lobby-host-name-2');
  const playerCount = document.getElementById('player-count');
  const playersList = document.getElementById('players-list');
  const hostControls = document.getElementById('host-controls');
  const nonHostHint = document.getElementById('non-host-hint');
  const startGameBtn = document.getElementById('start-game-btn');
  const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
  const lobbyChatMessages = document.getElementById('lobby-chat-messages');
  const lobbyChatForm = document.getElementById('lobby-chat-form');
  const lobbyChatInput = document.getElementById('lobby-chat-input');

  // Game Play
  const gameRoomCode = document.getElementById('game-room-code');
  const gameDimText = document.getElementById('game-dim-text');
  const leaveGameBtn = document.getElementById('leave-game-btn');
  const bingoHeader5x5 = document.getElementById('bingo-header-5x5');
  const bingoHeader100 = document.getElementById('bingo-header-100');
  const myCompletedLinesCount = document.getElementById('my-completed-lines-count');
  const myCompletedLinesCount100 = document.getElementById('my-completed-lines-count-100');
  const targetLines100 = document.getElementById('target-lines-100');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const turnOrderChips = document.getElementById('turn-order-chips');
  const currentTurnAlert = document.getElementById('current-turn-alert');
  const turnAvatarBadge = document.getElementById('turn-avatar-badge');
  const turnStatusTitle = document.getElementById('turn-status-title');
  const turnStatusSub = document.getElementById('turn-status-sub');
  const turnCallBox = document.getElementById('turn-call-box');
  const inputCallNumber = document.getElementById('input-call-number');
  const btnCallEnteredNumber = document.getElementById('btn-call-entered-number');
  const bingoGrid = document.getElementById('bingo-grid');
  const spotlightNumber = document.getElementById('spotlight-number');
  const spotlightCaller = document.getElementById('spotlight-caller');
  const calledCount = document.getElementById('called-count');
  const calledChipsList = document.getElementById('called-chips-list');
  const competitorsList = document.getElementById('competitors-list');
  const gameToastFeed = document.getElementById('game-toast-feed');
  const rxBtns = document.querySelectorAll('.rx-btn');

  // Modals
  const modalVictory = document.getElementById('modal-victory');
  const winnerNameDisplay = document.getElementById('winner-name-display');
  const vicTotalCalls = document.getElementById('vic-total-calls');
  const vicWinningLines = document.getElementById('vic-winning-lines');
  const btnRematch = document.getElementById('btn-rematch');
  const btnBackHub = document.getElementById('btn-back-hub');
  const modalLeaderboard = document.getElementById('modal-leaderboard');
  const leaderboardTbody = document.getElementById('leaderboard-tbody');
  const modalRules = document.getElementById('modal-rules');
  const appToast = document.getElementById('app-toast');

  // --- TOAST HELPER ---
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    appToast.textContent = msg;
    appToast.classList.add('show');
    toastTimer = setTimeout(() => {
      appToast.classList.remove('show');
    }, 3200);
  }

  // --- VIEW SWITCHER ---
  function showView(viewName) {
    Object.keys(views).forEach(key => {
      if (key === viewName) {
        views[key].classList.remove('hidden');
      } else {
        views[key].classList.add('hidden');
      }
    });

    if (state.username) {
      userPill.classList.remove('hidden');
      headerUsername.textContent = state.username;
      headerAvatar.style.background = state.avatarColor;
      headerAvatar.textContent = state.username.charAt(0).toUpperCase();
      hubGreetingName.textContent = state.username;
    } else {
      userPill.classList.add('hidden');
    }
  }

  // --- SOUND TOGGLE ---
  soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('bingo_sound', soundEnabled);
    soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
    showToast(soundEnabled ? 'Sound effects enabled' : 'Sound muted');
  });

  // --- INITIAL CHECK: AUTO JOIN FROM URL PARAM ---
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');

  if (state.username) {
    socket.emit('init_user', { username: state.username, avatarColor: state.avatarColor });
    if (roomParam) {
      inputTeamCode.value = roomParam.trim().toUpperCase();
      showView('hub');
      showToast(`Ready to join team: ${roomParam}`);
    } else {
      showView('hub');
    }
  } else {
    showView('onboarding');
    if (roomParam) {
      inputTeamCode.value = roomParam.trim().toUpperCase();
    }
  }

  // Change user
  changeUserBtn.addEventListener('click', () => {
    inputUsername.value = state.username;
    showView('onboarding');
  });
  brandLogo.addEventListener('click', () => {
    if (state.username) showView('hub');
  });

  // Avatar picker
  avatarPalette.addEventListener('click', (e) => {
    if (e.target.classList.contains('color-dot')) {
      avatarPalette.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      e.target.classList.add('active');
      state.avatarColor = e.target.dataset.color;
    }
  });

  // Onboarding Submit
  onboardingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = inputUsername.value.trim();
    if (!name) return;

    state.username = name;
    localStorage.setItem('bingo_username', name);
    localStorage.setItem('bingo_avatar_color', state.avatarColor);

    socket.emit('init_user', { username: state.username, avatarColor: state.avatarColor }, (res) => {
      if (res && res.success) {
        showToast(`Welcome, ${name}!`);
        showView('hub');
      }
    });
  });

  // Matrix Card Options in Hub
  matrixCardOptions.forEach(card => {
    card.addEventListener('click', () => {
      matrixCardOptions.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      radio.checked = true;

      // Adjust win lines suggestions based on matrix size
      if (radio.value === '100') {
        selectWinLines.innerHTML = `
          <option value="5" selected>5 Completed Lines</option>
          <option value="10">10 Completed Lines (Mega Mastery)</option>
          <option value="3">3 Completed Lines (Quick)</option>
        `;
      } else {
        selectWinLines.innerHTML = `
          <option value="5" selected>5 Completed Lines (Classic B-I-N-G-O)</option>
          <option value="3">3 Completed Lines (Quick Round)</option>
          <option value="4">4 Completed Lines</option>
          <option value="1">1 Completed Line (Blitz First Line)</option>
        `;
      }
    });
  });

  // --- CREATE TEAM / ROOM ---
  createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedSize = document.querySelector('input[name="matrixSize"]:checked').value;
    const winLines = selectWinLines.value;

    initAudio();
    playTone(400, 'sine', 0.1);

    socket.emit('create_room', {
      username: state.username,
      avatarColor: state.avatarColor,
      matrixSize: parseInt(selectedSize, 10),
      winLines: parseInt(winLines, 10)
    }, (res) => {
      if (res && res.success) {
        state.currentRoom = res.room;
        state.isHost = true;
        state.matrixSize = res.room.matrix_size;
        state.winLines = res.room.win_lines;
        renderLobby(res.room, res.players);
        showView('lobby');
        showToast(`Team room ${res.roomCode} created!`);
      } else {
        showToast(res ? res.error : 'Failed to create room');
      }
    });
  });

  // --- JOIN TEAM / ROOM ---
  joinRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = inputTeamCode.value.trim().toUpperCase();
    if (!code) return;

    initAudio();
    playTone(400, 'sine', 0.1);

    socket.emit('join_room', {
      username: state.username,
      avatarColor: state.avatarColor,
      roomCode: code
    }, (res) => {
      if (res && res.success) {
        state.currentRoom = res.room;
        state.isHost = res.room.host_username.toLowerCase() === state.username.toLowerCase();
        state.matrixSize = res.room.matrix_size;
        state.winLines = res.room.win_lines;
        renderLobby(res.room, res.players);
        showView('lobby');
        showToast(`Joined team ${code}!`);
      } else {
        showToast(res ? res.error : 'Could not join room');
      }
    });
  });

  // --- RENDER LOBBY ---
  function renderLobby(room, players) {
    lobbyTeamCode.textContent = room.room_code;
    lobbyMatrixSize.textContent = `${room.matrix_size} Numbers (${Math.sqrt(room.matrix_size)}x${Math.sqrt(room.matrix_size)})`;
    lobbyWinGoal.textContent = `${room.win_lines} Lines to Win`;
    lobbyHostName.textContent = room.host_username;
    lobbyHostName2.textContent = room.host_username;
    playerCount.textContent = players.length;

    playersList.innerHTML = '';
    players.forEach(p => {
      const isPlayerHost = p.username.toLowerCase() === room.host_username.toLowerCase();
      const card = document.createElement('div');
      card.className = `player-card ${isPlayerHost ? 'is-host' : ''}`;
      card.innerHTML = `
        ${isPlayerHost ? '<div class="host-crown" title="Host">👑</div>' : ''}
        <div class="card-avatar" style="background: ${isPlayerHost ? '#f59e0b' : '#6366f1'};">
          ${p.username.charAt(0).toUpperCase()}
        </div>
        <div class="card-player-name" title="${p.username}">${p.username}</div>
        <div class="card-status">${isPlayerHost ? 'Host' : 'Ready'}</div>
      `;
      playersList.appendChild(card);
    });

    const isHost = state.username.toLowerCase() === room.host_username.toLowerCase();
    state.isHost = isHost;

    if (isHost) {
      hostControls.classList.remove('hidden');
      nonHostHint.classList.add('hidden');
    } else {
      hostControls.classList.add('hidden');
      nonHostHint.classList.remove('hidden');
    }
  }

  // Copy Code & Link
  copyCodeBtn.addEventListener('click', () => {
    if (state.currentRoom) {
      navigator.clipboard.writeText(state.currentRoom.room_code);
      showToast(`Copied code: ${state.currentRoom.room_code}`);
    }
  });

  copyLinkBtn.addEventListener('click', () => {
    if (state.currentRoom) {
      const shareUrl = `${window.location.origin}/?room=${state.currentRoom.room_code}`;
      navigator.clipboard.writeText(shareUrl);
      showToast(`Shareable link copied to clipboard!`);
    }
  });

  // Leave Lobby
  leaveLobbyBtn.addEventListener('click', () => {
    window.location.search = '';
    showView('hub');
  });

  // Lobby Chat
  lobbyChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = lobbyChatInput.value.trim();
    if (!msg || !state.currentRoom) return;
    socket.emit('send_chat', { roomCode: state.currentRoom.room_code, message: msg });
    lobbyChatInput.value = '';
  });

  // --- START GAME (Host triggers server to randomize turn order & boards) ---
  startGameBtn.addEventListener('click', () => {
    if (!state.currentRoom) return;
    initAudio();
    startGameBtn.disabled = true;
    startGameBtn.textContent = 'Randomizing & Starting...';

    socket.emit('start_game', { roomCode: state.currentRoom.room_code }, (res) => {
      startGameBtn.disabled = false;
      startGameBtn.innerHTML = `<span>🎮 Start Game & Roll Turn Order</span><span class="btn-arrow">→</span>`;
      if (res && !res.success) {
        showToast(res.error || 'Failed to start game');
      }
    });
  });

  // --- GAME START RECEIVER ---
  socket.on('game_started', (data) => {
    state.currentRoom = data.room;
    state.myBoard = data.myBoard;
    state.turnOrder = data.turnOrder;
    state.currentTurnPlayer = data.currentTurnPlayer;
    state.matrixSize = data.matrixSize;
    state.winLines = data.winLines;
    state.calledNumbers = [];
    state.completedLines = [];
    state.gameActive = true;

    modalVictory.classList.add('hidden');

    playTone(600, 'sine', 0.2);
    initGameBoard();
    updateTurnDisplay();
    updateStandings(data.players || []);
    showView('game');
    showToast(`Game started! Randomized matrix & turn order set.`);
  });

  // --- INITIALIZE GAME BOARD UI ---
  function initGameBoard() {
    gameRoomCode.textContent = state.currentRoom.room_code;
    const dim = Math.round(Math.sqrt(state.matrixSize));
    gameDimText.textContent = `${dim}×${dim} Matrix (${state.matrixSize} Numbers)`;

    // Headers
    if (state.matrixSize === 25) {
      bingoHeader5x5.classList.remove('hidden');
      bingoHeader100.classList.add('hidden');
      document.querySelectorAll('.b-letter').forEach(l => l.classList.remove('unlocked'));
      myCompletedLinesCount.textContent = '0';
    } else {
      bingoHeader5x5.classList.add('hidden');
      bingoHeader100.classList.remove('hidden');
      myCompletedLinesCount100.textContent = '0';
      targetLines100.textContent = state.winLines;
      progressBarFill.style.width = '0%';
    }

    // Called history reset
    spotlightNumber.textContent = '—';
    spotlightCaller.textContent = 'Game started. Call first number!';
    calledCount.textContent = '0';
    calledChipsList.innerHTML = '<div class="empty-chips">No numbers called yet.</div>';

    // Render Matrix Grid
    bingoGrid.className = `bingo-grid ${state.matrixSize === 100 ? 'grid-10x10' : 'grid-5x5'}`;
    bingoGrid.innerHTML = '';

    state.myBoard.forEach((num) => {
      const cell = document.createElement('div');
      cell.className = 'bingo-cell';
      cell.dataset.number = num;
      cell.textContent = num;

      cell.addEventListener('click', () => {
        handleCellClick(num);
      });

      bingoGrid.appendChild(cell);
    });

    // Quick call input limits
    inputCallNumber.min = 1;
    inputCallNumber.max = state.matrixSize;
    inputCallNumber.value = '';
  }

  // --- TURN MANAGEMENT & INTERACTION ---
  function isMyTurn() {
    return state.currentTurnPlayer && state.currentTurnPlayer.toLowerCase() === state.username.toLowerCase();
  }

  function updateTurnDisplay() {
    // Render turn order carousel chips
    turnOrderChips.innerHTML = '';
    state.turnOrder.forEach((player, idx) => {
      const isCurrent = player.toLowerCase() === (state.currentTurnPlayer || '').toLowerCase();
      const chip = document.createElement('div');
      chip.className = `turn-player-chip ${isCurrent ? 'is-active' : ''}`;
      chip.innerHTML = `
        <span class="chip-dot" style="color: ${isCurrent ? '#10b981' : '#94a3b8'};">●</span>
        <span>${player}</span>
      `;
      turnOrderChips.appendChild(chip);

      if (idx < state.turnOrder.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'turn-arrow-divider';
        arrow.textContent = '→';
        turnOrderChips.appendChild(arrow);
      }
    });

    // Alert Banner
    if (isMyTurn()) {
      currentTurnAlert.classList.add('my-turn-alert');
      turnAvatarBadge.style.background = '#10b981';
      turnAvatarBadge.textContent = '👉';
      turnStatusTitle.textContent = `It's YOUR Turn!`;
      turnStatusSub.textContent = `Click any unmarked number on your board or type it below to call it.`;
      turnCallBox.classList.remove('hidden');
      inputCallNumber.disabled = false;
      btnCallEnteredNumber.disabled = false;
      playTurnAlertSound();
    } else {
      currentTurnAlert.classList.remove('my-turn-alert');
      turnAvatarBadge.style.background = '#6366f1';
      turnAvatarBadge.textContent = (state.currentTurnPlayer || '?').charAt(0).toUpperCase();
      turnStatusTitle.textContent = `Waiting for ${state.currentTurnPlayer}...`;
      turnStatusSub.textContent = `${state.currentTurnPlayer} is choosing a number to cross out for everyone.`;
      turnCallBox.classList.add('hidden');
    }
  }

  // --- NUMBER CALL HANDLER ---
  function handleCellClick(num) {
    if (!state.gameActive) return;

    if (state.calledNumbers.includes(num)) {
      showToast(`Number ${num} is already crossed out!`);
      return;
    }

    if (!isMyTurn()) {
      showToast(`Wait for your turn! It's currently ${state.currentTurnPlayer}'s turn.`);
      return;
    }

    submitCallNumber(num);
  }

  btnCallEnteredNumber.addEventListener('click', () => {
    const val = parseInt(inputCallNumber.value, 10);
    if (isNaN(val)) return;
    submitCallNumber(val);
  });

  inputCallNumber.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = parseInt(inputCallNumber.value, 10);
      if (!isNaN(val)) submitCallNumber(val);
    }
  });

  function submitCallNumber(num) {
    if (isNaN(num) || num < 1 || num > state.matrixSize) {
      showToast(`Enter a valid number between 1 and ${state.matrixSize}`);
      return;
    }
    if (state.calledNumbers.includes(num)) {
      showToast(`Number ${num} was already called!`);
      return;
    }

    initAudio();
    socket.emit('call_number', {
      roomCode: state.currentRoom.room_code,
      number: num
    }, (res) => {
      inputCallNumber.value = '';
      if (res && !res.success) {
        showToast(res.error || 'Failed to call number');
      }
    });
  }

  // --- AUTOMATIC CROSS-OUT ON ALL PLAYERS' GAME BOARDS ---
  socket.on('number_called', (data) => {
    const num = data.calledNumber;
    const caller = data.calledBy;

    state.calledNumbers = data.allCalledNumbers;
    state.currentTurnPlayer = data.currentTurnPlayer;

    // Play call pop audio
    playCallSound();

    // 1. Automatic cross-out on local board
    const cell = bingoGrid.querySelector(`.bingo-cell[data-number="${num}"]`);
    if (cell) {
      cell.classList.add('marked');
    }

    // 2. Update spotlight display
    spotlightNumber.textContent = num;
    spotlightCaller.textContent = `Called by ${caller}`;

    // 3. Update called numbers ticker chips
    calledCount.textContent = state.calledNumbers.length;
    renderCalledChips();

    // 4. Calculate completed lines on this player's board
    evaluateCompletedLines();

    // 5. Update standings of all competitors
    if (data.playerStats) {
      updateStandings(data.playerStats);
    }

    // 6. Advance turn display
    updateTurnDisplay();
  });

  function renderCalledChips() {
    calledChipsList.innerHTML = '';
    const reversed = [...state.calledNumbers].reverse();
    reversed.forEach(n => {
      const chip = document.createElement('span');
      chip.className = 'called-chip';
      chip.textContent = n;
      calledChipsList.appendChild(chip);
    });
  }

  // --- EVALUATE COMPLETED LINES ---
  function evaluateCompletedLines() {
    const dim = Math.round(Math.sqrt(state.matrixSize));
    const markedSet = new Set(state.calledNumbers);
    const completedLines = [];

    // Rows
    for (let r = 0; r < dim; r++) {
      const cells = [];
      let full = true;
      for (let c = 0; c < dim; c++) {
        const idx = r * dim + c;
        const val = state.myBoard[idx];
        cells.push(val);
        if (!markedSet.has(val)) full = false;
      }
      if (full) completedLines.push(cells);
    }

    // Columns
    for (let c = 0; c < dim; c++) {
      const cells = [];
      let full = true;
      for (let r = 0; r < dim; r++) {
        const idx = r * dim + c;
        const val = state.myBoard[idx];
        cells.push(val);
        if (!markedSet.has(val)) full = false;
      }
      if (full) completedLines.push(cells);
    }

    // Diagonal 1
    const diag1 = [];
    let d1Full = true;
    for (let i = 0; i < dim; i++) {
      const val = state.myBoard[i * dim + i];
      diag1.push(val);
      if (!markedSet.has(val)) d1Full = false;
    }
    if (d1Full) completedLines.push(diag1);

    // Diagonal 2
    const diag2 = [];
    let d2Full = true;
    for (let i = 0; i < dim; i++) {
      const val = state.myBoard[i * dim + (dim - 1 - i)];
      diag2.push(val);
      if (!markedSet.has(val)) d2Full = false;
    }
    if (d2Full) completedLines.push(diag2);

    const prevLineCount = state.completedLines.length;
    state.completedLines = completedLines;

    // Check if new line was unlocked
    if (completedLines.length > prevLineCount) {
      playLineCompletedSound();
      showToast(`⭐ Line Completed! (${completedLines.length} Total)`);
    }

    // Highlight cells in completed lines
    const lineNumbers = new Set(completedLines.flat());
    bingoGrid.querySelectorAll('.bingo-cell').forEach(c => {
      const n = parseInt(c.dataset.number, 10);
      if (lineNumbers.has(n)) {
        c.classList.add('line-completed');
      }
    });

    // Update B-I-N-G-O letters or Progress Bar
    const count = completedLines.length;
    if (state.matrixSize === 25) {
      myCompletedLinesCount.textContent = count;
      const letters = document.querySelectorAll('.b-letter');
      letters.forEach((l, idx) => {
        if (idx < count) {
          l.classList.add('unlocked');
        } else {
          l.classList.remove('unlocked');
        }
      });
    } else {
      myCompletedLinesCount100.textContent = count;
      const pct = Math.min(100, Math.round((count / state.winLines) * 100));
      progressBarFill.style.width = `${pct}%`;
    }
  }

  // --- UPDATE COMPETITORS STANDINGS ---
  function updateStandings(players) {
    competitorsList.innerHTML = '';
    const sorted = [...players].sort((a, b) => (b.completedLines || 0) - (a.completedLines || 0));

    sorted.forEach(p => {
      const isMe = p.username.toLowerCase() === state.username.toLowerCase();
      const item = document.createElement('div');
      item.className = 'comp-item';
      item.innerHTML = `
        <div class="comp-user">
          <div class="comp-avatar" style="background: ${isMe ? '#10b981' : '#6366f1'};">
            ${p.username.charAt(0).toUpperCase()}
          </div>
          <span class="comp-name">${p.username} ${isMe ? '(You)' : ''}</span>
        </div>
        <span class="comp-score">${p.completedLines || 0} Lines</span>
      `;
      competitorsList.appendChild(item);
    });
  }

  // --- GAME OVER & VICTORY ---
  socket.on('game_over', (data) => {
    state.gameActive = false;
    winnerNameDisplay.textContent = data.winner;
    vicTotalCalls.textContent = state.calledNumbers.length;
    vicWinningLines.textContent = data.winningLines;

    playVictorySound();

    // Trigger confetti
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 55,
          origin: { x: 0 }
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 55,
          origin: { x: 1 }
        });
      }, 350);
    }

    modalVictory.classList.remove('hidden');
  });

  // Rematch button
  btnRematch.addEventListener('click', () => {
    if (!state.currentRoom) return;
    initAudio();
    socket.emit('rematch', { roomCode: state.currentRoom.room_code }, (res) => {
      if (res && !res.success) {
        showToast(res.error || 'Failed to restart match');
      }
    });
  });

  btnBackHub.addEventListener('click', () => {
    modalVictory.classList.add('hidden');
    showView('hub');
  });

  leaveGameBtn.addEventListener('click', () => {
    if (confirm('Leave current game and return to hub?')) {
      state.gameActive = false;
      showView('hub');
    }
  });

  // --- QUICK IN-GAME REACTIONS ---
  rxBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      if (!state.currentRoom) return;
      socket.emit('send_chat', {
        roomCode: state.currentRoom.room_code,
        message: emoji
      });
    });
  });

  socket.on('chat_message', (data) => {
    // In lobby
    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.innerHTML = `<b>${data.username}:</b> ${data.message}`;
    lobbyChatMessages.appendChild(chatItem);
    lobbyChatMessages.scrollTop = lobbyChatMessages.scrollHeight;

    // In-game feed toast
    gameToastFeed.textContent = `${data.username}: ${data.message}`;
    setTimeout(() => {
      if (gameToastFeed.textContent === `${data.username}: ${data.message}`) {
        gameToastFeed.textContent = '';
      }
    }, 3000);
  });

  socket.on('system_message', (msg) => {
    const item = document.createElement('div');
    item.className = 'chat-item system-msg';
    item.textContent = msg;
    lobbyChatMessages.appendChild(item);
    lobbyChatMessages.scrollTop = lobbyChatMessages.scrollHeight;

    gameToastFeed.textContent = `📢 ${msg}`;
    setTimeout(() => {
      if (gameToastFeed.textContent === `📢 ${msg}`) {
        gameToastFeed.textContent = '';
      }
    }, 4000);
  });

  socket.on('room_updated', ({ room, players }) => {
    state.currentRoom = room;
    renderLobby(room, players);
  });

  // --- LEADERBOARD MODAL (SQLite Powered) ---
  leaderboardBtn.addEventListener('click', async () => {
    modalLeaderboard.classList.remove('hidden');
    leaderboardTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading SQLite records...</td></tr>';

    try {
      const resp = await fetch('/api/leaderboard');
      const data = await resp.json();
      if (data.success && data.leaders && data.leaders.length > 0) {
        leaderboardTbody.innerHTML = '';
        data.leaders.forEach((u, i) => {
          const winRate = u.games_played > 0 ? Math.round((u.games_won / u.games_played) * 100) : 0;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><b>#${i + 1}</b></td>
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:18px; height:18px; border-radius:50%; background:${u.avatar_color || '#6366f1'};"></span>
                <b>${u.username}</b>
              </div>
            </td>
            <td style="color:#fbbf24; font-weight:800;">${u.games_won}</td>
            <td>${u.games_played}</td>
            <td><span style="color:#10b981; font-weight:700;">${winRate}%</span></td>
          `;
          leaderboardTbody.appendChild(tr);
        });
      } else {
        leaderboardTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No matches recorded in SQLite yet. Play the first game!</td></tr>';
      }
    } catch (e) {
      leaderboardTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Failed to load leaderboard.</td></tr>';
    }
  });

  // Rules Modal
  rulesBtn.addEventListener('click', () => {
    modalRules.classList.remove('hidden');
  });

  // Close modals
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) document.getElementById(modalId).classList.add('hidden');
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.add('hidden');
    }
  });
})();
