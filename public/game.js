(() => {
  'use strict';

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  let audioCtx = null;
  let soundEnabled = localStorage.getItem('bingo_sound') !== 'false';

  function initAudio() {
    try {
      if (!audioCtx) {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (AudioClass) audioCtx = new AudioClass();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    } catch (e) {
      // Audio not permitted or supported
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
    } catch (e) {}
  }

  function playCallSound() {
    playTone(523.25, 'triangle', 0.12, 0.15);
    setTimeout(() => playTone(659.25, 'triangle', 0.18, 0.15), 90);
  }

  function playTurnAlertSound() {
    playTone(440, 'sine', 0.1, 0.12);
    setTimeout(() => playTone(880, 'sine', 0.2, 0.12), 110);
  }

  function playLineCompletedSound() {
    playTone(587.33, 'triangle', 0.15, 0.2);
    setTimeout(() => playTone(783.99, 'triangle', 0.15, 0.2), 120);
    setTimeout(() => playTone(1046.50, 'triangle', 0.3, 0.2), 240);
  }

  function playVictorySound() {
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'triangle', 0.25, 0.25), idx * 130);
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
    currentTurnIndex: 0,
    currentTurnPlayer: null,
    completedLines: [],
    gameActive: false,
    isOnline: false,
    isLocalOnly: false,
    players: []
  };

  // --- SAFE NETWORKING (Socket.IO + BroadcastChannel Fallback) ---
  let socket = null;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bingo_network_channel') : null;

  function updateNetworkStatus(status, text) {
    const pill = document.getElementById('network-status-pill');
    const dot = pill ? pill.querySelector('.status-dot') : null;
    const txt = document.getElementById('network-status-text');
    if (dot) {
      dot.className = 'status-dot ' + (status === 'online' ? 'online' : 'offline');
    }
    if (txt) {
      txt.textContent = text;
    }
  }

  if (typeof io !== 'undefined') {
    try {
      const isHttp = window.location.protocol.startsWith('http');
      const socketUrl = isHttp && (window.location.port === '3000' || window.location.port === '')
        ? undefined
        : 'http://localhost:3000';

      socket = io(socketUrl, {
        reconnectionAttempts: 4,
        timeout: 2500,
        autoConnect: true
      });

      socket.on('connect', () => {
        state.isOnline = true;
        state.isLocalOnly = false;
        updateNetworkStatus('online', 'Live Server');
        if (state.username) {
          socket.emit('init_user', { username: state.username, avatarColor: state.avatarColor });
        }
      });

      socket.on('connect_error', () => {
        state.isOnline = false;
        state.isLocalOnly = true;
        updateNetworkStatus('offline', 'Multi-Tab Sync');
      });

      socket.on('disconnect', () => {
        state.isOnline = false;
        state.isLocalOnly = true;
        updateNetworkStatus('offline', 'Multi-Tab Sync');
      });
    } catch (e) {
      state.isOnline = false;
      state.isLocalOnly = true;
      updateNetworkStatus('offline', 'Multi-Tab Sync');
    }
  } else {
    state.isOnline = false;
    state.isLocalOnly = true;
    updateNetworkStatus('offline', 'Multi-Tab Sync');
  }

  // --- HELPER ALGORITHMS ---
  function shuffleArray(arr) {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
  }

  function generateRandomBoard(size) {
    const nums = Array.from({ length: size }, (_, i) => i + 1);
    return shuffleArray(nums);
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'TEAM-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // --- DOM ELEMENTS ---
  const views = {
    onboarding: document.getElementById('view-onboarding'),
    hub: document.getElementById('view-hub'),
    lobby: document.getElementById('view-lobby'),
    game: document.getElementById('view-game')
  };

  const headerAvatar = document.getElementById('header-avatar');
  const headerUsername = document.getElementById('header-username');
  const userPill = document.getElementById('user-pill');
  const changeUserBtn = document.getElementById('change-user-btn');
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const soundIcon = document.getElementById('sound-icon');
  const leaderboardBtn = document.getElementById('leaderboard-btn');
  const rulesBtn = document.getElementById('rules-btn');
  const brandLogo = document.getElementById('brand-logo');

  const onboardingForm = document.getElementById('onboarding-form');
  const inputUsername = document.getElementById('input-username');
  const avatarPalette = document.getElementById('avatar-palette');

  const hubGreetingName = document.getElementById('hub-greeting-name');
  const createRoomForm = document.getElementById('create-room-form');
  const joinRoomForm = document.getElementById('join-room-form');
  const inputTeamCode = document.getElementById('input-team-code');
  const matrixCardOptions = document.querySelectorAll('.matrix-card-option');
  const selectWinLines = document.getElementById('select-win-lines');

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
  const btnAddBot = document.getElementById('btn-add-bot');
  const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
  const lobbyChatMessages = document.getElementById('lobby-chat-messages');
  const lobbyChatForm = document.getElementById('lobby-chat-form');
  const lobbyChatInput = document.getElementById('lobby-chat-input');

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

  // --- TOAST NOTIFICATIONS ---
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    if (!appToast) return;
    appToast.textContent = msg;
    appToast.classList.add('show');
    toastTimer = setTimeout(() => {
      appToast.classList.remove('show');
    }, 3200);
  }

  // --- VIEW ROUTING ---
  function showView(viewName) {
    Object.keys(views).forEach(key => {
      if (!views[key]) return;
      if (key === viewName) {
        views[key].classList.remove('hidden');
      } else {
        views[key].classList.add('hidden');
      }
    });

    if (state.username) {
      if (userPill) userPill.classList.remove('hidden');
      if (headerUsername) headerUsername.textContent = state.username;
      if (headerAvatar) {
        headerAvatar.style.background = state.avatarColor;
        headerAvatar.textContent = state.username.charAt(0).toUpperCase();
      }
      if (hubGreetingName) hubGreetingName.textContent = state.username;
    } else {
      if (userPill) userPill.classList.add('hidden');
    }
  }

  // --- SOUND TOGGLE ---
  if (soundIcon) soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('bingo_sound', soundEnabled);
      if (soundIcon) soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
      showToast(soundEnabled ? 'Sound effects enabled' : 'Sound muted');
    });
  }

  // --- INITIAL CHECK ---
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');

  if (state.username) {
    if (roomParam && inputTeamCode) {
      inputTeamCode.value = roomParam.trim().toUpperCase();
    }
    showView('hub');
  } else {
    showView('onboarding');
    if (roomParam && inputTeamCode) {
      inputTeamCode.value = roomParam.trim().toUpperCase();
    }
  }

  // Edit profile button
  if (changeUserBtn) {
    changeUserBtn.addEventListener('click', () => {
      if (inputUsername) inputUsername.value = state.username;
      showView('onboarding');
    });
  }
  if (brandLogo) {
    brandLogo.addEventListener('click', () => {
      if (state.username) showView('hub');
    });
  }

  // Avatar palette selection
  if (avatarPalette) {
    avatarPalette.addEventListener('click', (e) => {
      const dot = e.target.closest('.color-dot');
      if (dot) {
        avatarPalette.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.avatarColor = dot.dataset.color || '#6366f1';
      }
    });
  }

  // --- ONBOARDING FORM SUBMISSION ---
  if (onboardingForm) {
    onboardingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (inputUsername ? inputUsername.value : '').trim();
      if (!name) {
        showToast('Please enter your nickname!');
        return;
      }

      state.username = name;
      localStorage.setItem('bingo_username', name);
      localStorage.setItem('bingo_avatar_color', state.avatarColor);

      if (socket && state.isOnline) {
        socket.emit('init_user', { username: state.username, avatarColor: state.avatarColor });
      }

      showToast(`Welcome, ${name}!`);
      showView('hub');
    });
  }

  // --- MATRIX SIZE RADIO SELECTION ---
  matrixCardOptions.forEach(card => {
    card.addEventListener('click', () => {
      matrixCardOptions.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const size = card.dataset.size || '25';
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;

      state.matrixSize = parseInt(size, 10);

      if (selectWinLines) {
        if (size === '100') {
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
      }
    });
  });

  // --- CREATE TEAM ROOM ---
  function handleCreateRoom() {
    const sizeRadio = document.querySelector('input[name="matrixSize"]:checked');
    const selectedSize = sizeRadio ? parseInt(sizeRadio.value, 10) : 25;
    const winLines = selectWinLines ? parseInt(selectWinLines.value, 10) : 5;

    initAudio();
    playTone(400, 'sine', 0.1);

    const roomCode = generateRoomCode();
    state.matrixSize = selectedSize;
    state.winLines = winLines;
    state.isHost = true;

    const hostPlayer = {
      username: state.username,
      avatarColor: state.avatarColor,
      isHost: true,
      isReady: true,
      completedLines: 0
    };
    state.players = [hostPlayer];

    const roomData = {
      room_code: roomCode,
      host_username: state.username,
      matrix_size: selectedSize,
      win_lines: winLines,
      status: 'waiting',
      players: state.players
    };
    state.currentRoom = roomData;

    // Persist locally for multi-tab support
    localStorage.setItem('bingo_room_' + roomCode, JSON.stringify(roomData));

    // Try online server first
    if (socket && state.isOnline) {
      socket.emit('create_room', {
        username: state.username,
        avatarColor: state.avatarColor,
        matrixSize: selectedSize,
        winLines: winLines
      }, (res) => {
        if (res && res.success) {
          state.currentRoom = res.room;
          state.players = res.players || [hostPlayer];
          renderLobby(res.room, state.players);
        }
      });
    }

    // Always render lobby immediately
    renderLobby(roomData, state.players);
    showView('lobby');
    showToast(`Team room ${roomCode} created!`);

    // Broadcast on multi-tab channel
    broadcastMessage({
      type: 'ROOM_CREATED',
      room: roomData,
      players: state.players
    });
  }

  if (createRoomForm) {
    createRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCreateRoom();
    });
  }

  // --- JOIN TEAM ROOM ---
  function handleJoinRoom(code) {
    const cleanCode = (code || (inputTeamCode ? inputTeamCode.value : '')).trim().toUpperCase();
    if (!cleanCode) {
      showToast('Please enter a team code!');
      return;
    }

    initAudio();
    playTone(400, 'sine', 0.1);

    // Try online server first
    if (socket && state.isOnline) {
      socket.emit('join_room', {
        username: state.username,
        avatarColor: state.avatarColor,
        roomCode: cleanCode
      }, (res) => {
        if (res && res.success) {
          state.currentRoom = res.room;
          state.isHost = res.room.host_username.toLowerCase() === state.username.toLowerCase();
          state.matrixSize = res.room.matrix_size;
          state.winLines = res.room.win_lines;
          state.players = res.players || [];
          renderLobby(res.room, state.players);
          showView('lobby');
          showToast(`Joined team ${cleanCode}!`);
          return;
        } else if (res && res.error) {
          showToast(res.error);
        }
      });
    }

    // Check localStorage room (Multi-Tab P2P Fallback)
    const stored = localStorage.getItem('bingo_room_' + cleanCode);
    let room = stored ? JSON.parse(stored) : null;

    if (!room) {
      // Create provisional room instance so joiners can always connect!
      room = {
        room_code: cleanCode,
        host_username: 'Host',
        matrix_size: 25,
        win_lines: 5,
        status: 'waiting',
        players: []
      };
    }

    state.currentRoom = room;
    state.isHost = room.host_username.toLowerCase() === state.username.toLowerCase();
    state.matrixSize = room.matrix_size || 25;
    state.winLines = room.win_lines || 5;

    // Add self to players
    const existing = (room.players || []).find(p => p.username.toLowerCase() === state.username.toLowerCase());
    if (!existing) {
      room.players = room.players || [];
      room.players.push({
        username: state.username,
        avatarColor: state.avatarColor,
        isHost: state.isHost,
        isReady: true,
        completedLines: 0
      });
    }
    state.players = room.players;
    localStorage.setItem('bingo_room_' + cleanCode, JSON.stringify(room));

    renderLobby(room, state.players);
    showView('lobby');
    showToast(`Joined team ${cleanCode}!`);

    // Notify other tabs
    broadcastMessage({
      type: 'PLAYER_JOINED',
      roomCode: cleanCode,
      player: {
        username: state.username,
        avatarColor: state.avatarColor,
        isHost: state.isHost,
        isReady: true,
        completedLines: 0
      }
    });
  }

  if (joinRoomForm) {
    joinRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleJoinRoom();
    });
  }

  // --- RENDER LOBBY ---
  function renderLobby(room, players) {
    if (lobbyTeamCode) lobbyTeamCode.textContent = room.room_code;
    if (lobbyMatrixSize) lobbyMatrixSize.textContent = `${room.matrix_size} Numbers (${Math.sqrt(room.matrix_size)}x${Math.sqrt(room.matrix_size)})`;
    if (lobbyWinGoal) lobbyWinGoal.textContent = `${room.win_lines} Lines to Win`;
    if (lobbyHostName) lobbyHostName.textContent = room.host_username;
    if (lobbyHostName2) lobbyHostName2.textContent = room.host_username;
    if (playerCount) playerCount.textContent = players.length;

    if (playersList) {
      playersList.innerHTML = '';
      players.forEach(p => {
        const isPlayerHost = p.username.toLowerCase() === room.host_username.toLowerCase();
        const card = document.createElement('div');
        card.className = `player-card ${isPlayerHost ? 'is-host' : ''}`;
        card.innerHTML = `
          ${isPlayerHost ? '<div class="host-crown" title="Host">👑</div>' : ''}
          <div class="card-avatar" style="background: ${p.avatarColor || (isPlayerHost ? '#f59e0b' : '#6366f1')};">
            ${p.username.charAt(0).toUpperCase()}
          </div>
          <div class="card-player-name" title="${p.username}">${p.username}</div>
          <div class="card-status">${isPlayerHost ? 'Host' : 'Ready'}</div>
        `;
        playersList.appendChild(card);
      });
    }

    const isHost = state.username.toLowerCase() === room.host_username.toLowerCase();
    state.isHost = isHost;

    if (hostControls) {
      if (isHost) {
        hostControls.classList.remove('hidden');
        if (nonHostHint) nonHostHint.classList.add('hidden');
      } else {
        hostControls.classList.add('hidden');
        if (nonHostHint) nonHostHint.classList.remove('hidden');
      }
    }
  }

  // Add Practice Bot (allows testing solo multiplayer turn switching!)
  if (btnAddBot) {
    btnAddBot.addEventListener('click', () => {
      if (!state.currentRoom) return;
      const botNames = ['RoboPlayer', 'BingoBot', 'AceMatrix', 'PixelPro', 'LuckyStrike'];
      const unusedName = botNames.find(n => !state.players.some(p => p.username === n)) || `Bot_${Math.floor(Math.random() * 90 + 10)}`;
      const botPlayer = {
        username: unusedName,
        avatarColor: '#ec4899',
        isHost: false,
        isBot: true,
        isReady: true,
        completedLines: 0
      };
      state.players.push(botPlayer);
      state.currentRoom.players = state.players;
      localStorage.setItem('bingo_room_' + state.currentRoom.room_code, JSON.stringify(state.currentRoom));
      renderLobby(state.currentRoom, state.players);
      showToast(`Added AI Player: ${unusedName}!`);

      broadcastMessage({
        type: 'PLAYER_JOINED',
        roomCode: state.currentRoom.room_code,
        player: botPlayer
      });
    });
  }

  // Copy Code & Link
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      if (state.currentRoom) {
        navigator.clipboard.writeText(state.currentRoom.room_code);
        showToast(`Copied code: ${state.currentRoom.room_code}`);
      }
    });
  }

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      if (state.currentRoom) {
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${state.currentRoom.room_code}`;
        navigator.clipboard.writeText(shareUrl);
        showToast(`Shareable invite link copied!`);
      }
    });
  }

  if (leaveLobbyBtn) {
    leaveLobbyBtn.addEventListener('click', () => {
      showView('hub');
    });
  }

  if (lobbyChatForm) {
    lobbyChatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = lobbyChatInput ? lobbyChatInput.value.trim() : '';
      if (!msg || !state.currentRoom) return;

      if (socket && state.isOnline) {
        socket.emit('send_chat', { roomCode: state.currentRoom.room_code, message: msg });
      }

      appendChatMessage(state.username, msg);
      broadcastMessage({
        type: 'CHAT',
        roomCode: state.currentRoom.room_code,
        username: state.username,
        message: msg
      });

      if (lobbyChatInput) lobbyChatInput.value = '';
    });
  }

  function appendChatMessage(username, message) {
    if (!lobbyChatMessages) return;
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.innerHTML = `<b>${username}:</b> ${message}`;
    lobbyChatMessages.appendChild(item);
    lobbyChatMessages.scrollTop = lobbyChatMessages.scrollHeight;

    if (gameToastFeed) {
      gameToastFeed.textContent = `${username}: ${message}`;
      setTimeout(() => {
        if (gameToastFeed.textContent === `${username}: ${message}`) {
          gameToastFeed.textContent = '';
        }
      }, 3000);
    }
  }

  // --- START GAME (Host Triggers Random Matrix & Random Turn Order) ---
  function handleStartGame() {
    if (!state.currentRoom) return;
    initAudio();

    if (socket && state.isOnline) {
      startGameBtn.disabled = true;
      startGameBtn.textContent = 'Randomizing & Starting...';

      socket.emit('start_game', { roomCode: state.currentRoom.room_code }, (res) => {
        if (startGameBtn) {
          startGameBtn.disabled = false;
          startGameBtn.innerHTML = `<span>🎮 Start Game & Roll Turn Order</span><span class="btn-arrow">→</span>`;
        }
        if (res && !res.success) {
          showToast(res.error || 'Failed to start online game');
        }
      });
      return;
    }

    // Local / Multi-Tab Engine: Randomize turn order & boards
    const playerNames = state.players.map(p => p.username);
    const randomizedTurnOrder = shuffleArray(playerNames);
    const myRandomBoard = generateRandomBoard(state.matrixSize);

    // Generate individual random boards for all players
    const allBoards = {};
    state.players.forEach(p => {
      allBoards[p.username.toLowerCase()] = generateRandomBoard(state.matrixSize);
    });
    allBoards[state.username.toLowerCase()] = myRandomBoard;

    const gamePayload = {
      room: state.currentRoom,
      players: state.players,
      turnOrder: randomizedTurnOrder,
      currentTurnPlayer: randomizedTurnOrder[0],
      currentTurnIndex: 0,
      matrixSize: state.matrixSize,
      winLines: state.winLines,
      allBoards: allBoards
    };

    // Save game state
    localStorage.setItem('bingo_game_' + state.currentRoom.room_code, JSON.stringify(gamePayload));

    // Broadcast start to other tabs
    broadcastMessage({
      type: 'GAME_STARTED',
      data: gamePayload
    });

    // Start on local tab
    startActiveGame({
      ...gamePayload,
      myBoard: myRandomBoard
    });
  }

  if (startGameBtn) {
    startGameBtn.addEventListener('click', handleStartGame);
  }

  // --- START ACTIVE GAME PLAY ---
  function startActiveGame(data) {
    state.currentRoom = data.room;
    state.myBoard = data.myBoard || generateRandomBoard(data.matrixSize || 25);
    state.turnOrder = data.turnOrder || [state.username];
    state.currentTurnIndex = data.currentTurnIndex || 0;
    state.currentTurnPlayer = data.currentTurnPlayer || state.turnOrder[0];
    state.matrixSize = data.matrixSize || 25;
    state.winLines = data.winLines || 5;
    state.calledNumbers = [];
    state.completedLines = [];
    state.gameActive = true;

    if (modalVictory) modalVictory.classList.add('hidden');

    playTone(600, 'sine', 0.2);
    initGameBoard();
    updateTurnDisplay();
    updateStandings(data.players || state.players);
    showView('game');
    showToast(`Game started! Unique random matrix & turn order active.`);

    checkAndTriggerBotTurn();
  }

  // Socket.io game started event
  if (socket) {
    socket.on('game_started', (data) => {
      startActiveGame(data);
    });
  }

  // --- INITIALIZE GAME BOARD UI ---
  function initGameBoard() {
    if (gameRoomCode && state.currentRoom) {
      gameRoomCode.textContent = state.currentRoom.room_code;
    }
    const dim = Math.round(Math.sqrt(state.matrixSize));
    if (gameDimText) {
      gameDimText.textContent = `${dim}×${dim} Matrix (${state.matrixSize} Numbers)`;
    }

    if (state.matrixSize === 25) {
      if (bingoHeader5x5) bingoHeader5x5.classList.remove('hidden');
      if (bingoHeader100) bingoHeader100.classList.add('hidden');
      document.querySelectorAll('.b-letter').forEach(l => l.classList.remove('unlocked'));
      if (myCompletedLinesCount) myCompletedLinesCount.textContent = '0';
    } else {
      if (bingoHeader5x5) bingoHeader5x5.classList.add('hidden');
      if (bingoHeader100) bingoHeader100.classList.remove('hidden');
      if (myCompletedLinesCount100) myCompletedLinesCount100.textContent = '0';
      if (targetLines100) targetLines100.textContent = state.winLines;
      if (progressBarFill) progressBarFill.style.width = '0%';
    }

    if (spotlightNumber) spotlightNumber.textContent = '—';
    if (spotlightCaller) spotlightCaller.textContent = 'Game started. Call first number!';
    if (calledCount) calledCount.textContent = '0';
    if (calledChipsList) calledChipsList.innerHTML = '<div class="empty-chips">No numbers called yet.</div>';

    // Render Matrix Grid
    if (bingoGrid) {
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
    }

    if (inputCallNumber) {
      inputCallNumber.min = 1;
      inputCallNumber.max = state.matrixSize;
      inputCallNumber.value = '';
    }
  }

  // --- TURN MANAGEMENT ---
  function isMyTurn() {
    return state.currentTurnPlayer && state.currentTurnPlayer.toLowerCase() === state.username.toLowerCase();
  }

  function updateTurnDisplay() {
    if (turnOrderChips) {
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
    }

    if (isMyTurn()) {
      if (currentTurnAlert) currentTurnAlert.classList.add('my-turn-alert');
      if (turnAvatarBadge) {
        turnAvatarBadge.style.background = '#10b981';
        turnAvatarBadge.textContent = '👉';
      }
      if (turnStatusTitle) turnStatusTitle.textContent = `It's YOUR Turn!`;
      if (turnStatusSub) turnStatusSub.textContent = `Click any unmarked number on your board or type it below to call it.`;
      if (turnCallBox) turnCallBox.classList.remove('hidden');
      if (inputCallNumber) inputCallNumber.disabled = false;
      if (btnCallEnteredNumber) btnCallEnteredNumber.disabled = false;
      playTurnAlertSound();
    } else {
      if (currentTurnAlert) currentTurnAlert.classList.remove('my-turn-alert');
      if (turnAvatarBadge) {
        turnAvatarBadge.style.background = '#6366f1';
        turnAvatarBadge.textContent = (state.currentTurnPlayer || '?').charAt(0).toUpperCase();
      }
      if (turnStatusTitle) turnStatusTitle.textContent = `Waiting for ${state.currentTurnPlayer}...`;
      if (turnStatusSub) turnStatusSub.textContent = `${state.currentTurnPlayer} is choosing a number to cross out for everyone.`;
      if (turnCallBox) turnCallBox.classList.add('hidden');
    }
  }

  // --- CALLING A NUMBER ---
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

  if (btnCallEnteredNumber) {
    btnCallEnteredNumber.addEventListener('click', () => {
      const val = parseInt(inputCallNumber ? inputCallNumber.value : '', 10);
      if (!isNaN(val)) submitCallNumber(val);
    });
  }

  if (inputCallNumber) {
    inputCallNumber.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = parseInt(inputCallNumber.value, 10);
        if (!isNaN(val)) submitCallNumber(val);
      }
    });
  }

  function submitCallNumber(num) {
    if (isNaN(num) || num < 1 || num > state.matrixSize) {
      showToast(`Enter a number between 1 and ${state.matrixSize}`);
      return;
    }
    if (state.calledNumbers.includes(num)) {
      showToast(`Number ${num} was already called!`);
      return;
    }

    initAudio();

    if (socket && state.isOnline) {
      socket.emit('call_number', {
        roomCode: state.currentRoom.room_code,
        number: num
      }, (res) => {
        if (inputCallNumber) inputCallNumber.value = '';
        if (res && !res.success) {
          showToast(res.error || 'Failed to call number');
        }
      });
      return;
    }

    // Local / Multi-Tab Execution
    if (inputCallNumber) inputCallNumber.value = '';
    executeNumberCall(num, state.username);
  }

  // Automatic execution of a number call across the game
  function executeNumberCall(num, caller) {
    if (state.calledNumbers.includes(num)) return;

    state.calledNumbers.push(num);

    // Advance turn
    state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
    state.currentTurnPlayer = state.turnOrder[state.currentTurnIndex];

    playCallSound();

    // 1. Cross-out on board
    if (bingoGrid) {
      const cell = bingoGrid.querySelector(`.bingo-cell[data-number="${num}"]`);
      if (cell) {
        cell.classList.add('marked');
      }
    }

    // 2. Spotlight
    if (spotlightNumber) spotlightNumber.textContent = num;
    if (spotlightCaller) spotlightCaller.textContent = `Called by ${caller}`;

    // 3. Ticker
    if (calledCount) calledCount.textContent = state.calledNumbers.length;
    renderCalledChips();

    // 4. Line detection
    evaluateCompletedLines();

    // 5. Update standings
    const myLines = state.completedLines.length;
    const playerRecord = state.players.find(p => p.username.toLowerCase() === state.username.toLowerCase());
    if (playerRecord) playerRecord.completedLines = myLines;

    updateStandings(state.players);
    updateTurnDisplay();

    // Check winner
    if (myLines >= state.winLines) {
      declareWinner(state.username);
    }

    // Broadcast call to other tabs
    broadcastMessage({
      type: 'NUMBER_CALLED',
      roomCode: state.currentRoom ? state.currentRoom.room_code : '',
      number: num,
      caller: caller,
      nextTurnPlayer: state.currentTurnPlayer,
      nextTurnIndex: state.currentTurnIndex,
      calledNumbers: state.calledNumbers,
      winner: myLines >= state.winLines ? state.username : null
    });

    // Check if next turn belongs to an AI Bot
    checkAndTriggerBotTurn();
  }

  function checkAndTriggerBotTurn() {
    if (!state.gameActive) return;
    const activePlayer = state.players.find(p => p.username === state.currentTurnPlayer);
    if (activePlayer && activePlayer.isBot) {
      setTimeout(() => {
        if (!state.gameActive || state.currentTurnPlayer !== activePlayer.username) return;
        const available = [];
        for (let i = 1; i <= state.matrixSize; i++) {
          if (!state.calledNumbers.includes(i)) available.push(i);
        }
        if (available.length > 0) {
          const pick = available[Math.floor(Math.random() * available.length)];
          executeNumberCall(pick, activePlayer.username);
        }
      }, 1600);
    }
  }

  // Socket.io number called handler
  if (socket) {
    socket.on('number_called', (data) => {
      const num = data.calledNumber;
      const caller = data.calledBy;

      state.calledNumbers = data.allCalledNumbers;
      state.currentTurnPlayer = data.currentTurnPlayer;
      state.currentTurnIndex = data.currentTurnIndex;

      playCallSound();

      if (bingoGrid) {
        const cell = bingoGrid.querySelector(`.bingo-cell[data-number="${num}"]`);
        if (cell) {
          cell.classList.add('marked');
        }
      }

      if (spotlightNumber) spotlightNumber.textContent = num;
      if (spotlightCaller) spotlightCaller.textContent = `Called by ${caller}`;

      if (calledCount) calledCount.textContent = state.calledNumbers.length;
      renderCalledChips();

      evaluateCompletedLines();

      if (data.playerStats) {
        updateStandings(data.playerStats);
      }
      updateTurnDisplay();
    });

    socket.on('game_over', (data) => {
      declareWinner(data.winner, data.winningLines);
    });

    socket.on('room_updated', ({ room, players }) => {
      state.currentRoom = room;
      state.players = players;
      renderLobby(room, players);
    });

    socket.on('chat_message', (data) => {
      appendChatMessage(data.username, data.message);
    });

    socket.on('system_message', (msg) => {
      if (lobbyChatMessages) {
        const item = document.createElement('div');
        item.className = 'chat-item system-msg';
        item.textContent = msg;
        lobbyChatMessages.appendChild(item);
        lobbyChatMessages.scrollTop = lobbyChatMessages.scrollHeight;
      }
      if (gameToastFeed) {
        gameToastFeed.textContent = `📢 ${msg}`;
        setTimeout(() => {
          if (gameToastFeed.textContent === `📢 ${msg}`) gameToastFeed.textContent = '';
        }, 4000);
      }
    });
  }

  function renderCalledChips() {
    if (!calledChipsList) return;
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

    const prevCount = state.completedLines.length;
    state.completedLines = completedLines;

    if (completedLines.length > prevCount) {
      playLineCompletedSound();
      showToast(`⭐ Line Completed! (${completedLines.length} Total)`);
    }

    // Highlight completed line cells
    const lineNumbers = new Set(completedLines.flat());
    if (bingoGrid) {
      bingoGrid.querySelectorAll('.bingo-cell').forEach(c => {
        const n = parseInt(c.dataset.number, 10);
        if (lineNumbers.has(n)) {
          c.classList.add('line-completed');
        }
      });
    }

    // Update B-I-N-G-O letters
    const count = completedLines.length;
    if (state.matrixSize === 25) {
      if (myCompletedLinesCount) myCompletedLinesCount.textContent = count;
      const letters = document.querySelectorAll('.b-letter');
      letters.forEach((l, idx) => {
        if (idx < count) l.classList.add('unlocked');
        else l.classList.remove('unlocked');
      });
    } else {
      if (myCompletedLinesCount100) myCompletedLinesCount100.textContent = count;
      const pct = Math.min(100, Math.round((count / state.winLines) * 100));
      if (progressBarFill) progressBarFill.style.width = `${pct}%`;
    }
  }

  // --- UPDATE STANDINGS ---
  function updateStandings(players) {
    if (!competitorsList) return;
    competitorsList.innerHTML = '';
    const sorted = [...players].sort((a, b) => (b.completedLines || 0) - (a.completedLines || 0));

    sorted.forEach(p => {
      const isMe = p.username.toLowerCase() === state.username.toLowerCase();
      const item = document.createElement('div');
      item.className = 'comp-item';
      item.innerHTML = `
        <div class="comp-user">
          <div class="comp-avatar" style="background: ${p.avatarColor || (isMe ? '#10b981' : '#6366f1')};">
            ${p.username.charAt(0).toUpperCase()}
          </div>
          <span class="comp-name">${p.username} ${isMe ? '(You)' : ''}</span>
        </div>
        <span class="comp-score">${p.completedLines || 0} Lines</span>
      `;
      competitorsList.appendChild(item);
    });
  }

  // --- WINNER DECLARATION ---
  function declareWinner(winnerName, winLinesCount = state.winLines) {
    state.gameActive = false;
    if (winnerNameDisplay) winnerNameDisplay.textContent = winnerName;
    if (vicTotalCalls) vicTotalCalls.textContent = state.calledNumbers.length;
    if (vicWinningLines) vicWinningLines.textContent = winLinesCount;

    playVictorySound();

    // Trigger confetti
    if (typeof confetti === 'function') {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      setTimeout(() => {
        confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } });
      }, 350);
    }

    if (modalVictory) modalVictory.classList.remove('hidden');

    // Update local stats
    const stats = JSON.parse(localStorage.getItem('bingo_local_stats') || '{}');
    const myStats = stats[state.username] || { games_played: 0, games_won: 0, username: state.username, avatar_color: state.avatarColor };
    myStats.games_played++;
    if (winnerName.toLowerCase() === state.username.toLowerCase()) {
      myStats.games_won++;
    }
    stats[state.username] = myStats;
    localStorage.setItem('bingo_local_stats', JSON.stringify(stats));
  }

  // Rematch
  if (btnRematch) {
    btnRematch.addEventListener('click', () => {
      if (socket && state.isOnline) {
        socket.emit('rematch', { roomCode: state.currentRoom.room_code });
      } else {
        handleStartGame();
      }
    });
  }

  if (btnBackHub) {
    btnBackHub.addEventListener('click', () => {
      if (modalVictory) modalVictory.classList.add('hidden');
      showView('hub');
    });
  }

  if (leaveGameBtn) {
    leaveGameBtn.addEventListener('click', () => {
      if (confirm('Leave current game and return to hub?')) {
        state.gameActive = false;
        showView('hub');
      }
    });
  }

  // Quick Reactions
  rxBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      if (!state.currentRoom) return;

      if (socket && state.isOnline) {
        socket.emit('send_chat', { roomCode: state.currentRoom.room_code, message: emoji });
      }

      appendChatMessage(state.username, emoji);
      broadcastMessage({
        type: 'CHAT',
        roomCode: state.currentRoom.room_code,
        username: state.username,
        message: emoji
      });
    });
  });

  // --- MULTI-TAB BROADCAST ENGINE ---
  function broadcastMessage(payload) {
    try {
      if (channel) {
        channel.postMessage(payload);
      }
    } catch (e) {}
  }

  if (channel) {
    channel.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'PLAYER_JOINED') {
        if (state.currentRoom && state.currentRoom.room_code === msg.roomCode) {
          const exists = state.players.some(p => p.username.toLowerCase() === msg.player.username.toLowerCase());
          if (!exists) {
            state.players.push(msg.player);
            renderLobby(state.currentRoom, state.players);
            showToast(`${msg.player.username} joined the lobby!`);
          }
        }
      } else if (msg.type === 'GAME_STARTED') {
        if (state.currentRoom && state.currentRoom.room_code === msg.data.room.room_code) {
          const myBoard = (msg.data.allBoards && msg.data.allBoards[state.username.toLowerCase()]) || generateRandomBoard(msg.data.matrixSize || 25);
          startActiveGame({
            ...msg.data,
            myBoard: myBoard
          });
        }
      } else if (msg.type === 'NUMBER_CALLED') {
        if (state.currentRoom && state.currentRoom.room_code === msg.roomCode) {
          if (!state.calledNumbers.includes(msg.number)) {
            executeNumberCall(msg.number, msg.caller);
          }
          if (msg.winner) {
            declareWinner(msg.winner);
          }
        }
      } else if (msg.type === 'CHAT') {
        if (state.currentRoom && state.currentRoom.room_code === msg.roomCode) {
          appendChatMessage(msg.username, msg.message);
        }
      }
    };
  }

  // --- LEADERBOARD MODAL ---
  if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', async () => {
      if (modalLeaderboard) modalLeaderboard.classList.remove('hidden');
      if (leaderboardTbody) leaderboardTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading records...</td></tr>';

      let leaders = [];

      // Try server first
      if (state.isOnline) {
        try {
          const resp = await fetch('/api/leaderboard');
          const data = await resp.json();
          if (data && data.success && data.leaders) {
            leaders = data.leaders;
          }
        } catch (e) {}
      }

      // Fallback to local stored stats
      if (!leaders || leaders.length === 0) {
        const stats = JSON.parse(localStorage.getItem('bingo_local_stats') || '{}');
        leaders = Object.values(stats).sort((a, b) => (b.games_won || 0) - (a.games_won || 0));
      }

      if (leaderboardTbody) {
        if (leaders.length > 0) {
          leaderboardTbody.innerHTML = '';
          leaders.forEach((u, i) => {
            const played = u.games_played || 0;
            const won = u.games_won || 0;
            const winRate = played > 0 ? Math.round((won / played) * 100) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><b>#${i + 1}</b></td>
              <td>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="display:inline-block; width:18px; height:18px; border-radius:50%; background:${u.avatar_color || '#6366f1'};"></span>
                  <b>${u.username}</b>
                </div>
              </td>
              <td style="color:#fbbf24; font-weight:800;">${won}</td>
              <td>${played}</td>
              <td><span style="color:#10b981; font-weight:700;">${winRate}%</span></td>
            `;
            leaderboardTbody.appendChild(tr);
          });
        } else {
          leaderboardTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No matches recorded yet. Complete a game to see records!</td></tr>';
        }
      }
    });
  }

  // Rules Modal
  if (rulesBtn) {
    rulesBtn.addEventListener('click', () => {
      if (modalRules) modalRules.classList.remove('hidden');
    });
  }

  // Close modals
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
      }
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.add('hidden');
    }
  });

})();
