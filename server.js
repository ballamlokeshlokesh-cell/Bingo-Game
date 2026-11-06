const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { dbHelpers } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to serve the nested directory if accessed
app.use('/Bingo-Game-main', express.static(path.join(__dirname, 'public')));

// Helper: Fisher-Yates shuffle
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper: Generate randomized board for a given matrix size
function generateRandomBoard(matrixSize) {
  const numbers = Array.from({ length: matrixSize }, (_, i) => i + 1);
  return shuffleArray(numbers);
}

// Helper: Generate clean room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TEAM-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: Calculate completed lines on a board
function calculateLines(board, matrixSize, calledNumbers) {
  const dim = Math.round(Math.sqrt(matrixSize));
  if (dim * dim !== matrixSize) return { count: 0, lines: [] };

  const markedSet = new Set(calledNumbers);
  const completedLines = [];

  // Check rows
  for (let r = 0; r < dim; r++) {
    const rowIndices = [];
    let complete = true;
    for (let c = 0; c < dim; c++) {
      const idx = r * dim + c;
      rowIndices.push(idx);
      if (!markedSet.has(board[idx])) {
        complete = false;
      }
    }
    if (complete) {
      completedLines.push({ type: 'row', index: r, cells: rowIndices });
    }
  }

  // Check columns
  for (let c = 0; c < dim; c++) {
    const colIndices = [];
    let complete = true;
    for (let r = 0; r < dim; r++) {
      const idx = r * dim + c;
      colIndices.push(idx);
      if (!markedSet.has(board[idx])) {
        complete = false;
      }
    }
    if (complete) {
      completedLines.push({ type: 'col', index: c, cells: colIndices });
    }
  }

  // Check main diagonal (top-left to bottom-right)
  const diag1Indices = [];
  let diag1Complete = true;
  for (let i = 0; i < dim; i++) {
    const idx = i * dim + i;
    diag1Indices.push(idx);
    if (!markedSet.has(board[idx])) {
      diag1Complete = false;
    }
  }
  if (diag1Complete) {
    completedLines.push({ type: 'diag', index: 1, cells: diag1Indices });
  }

  // Check anti-diagonal (top-right to bottom-left)
  const diag2Indices = [];
  let diag2Complete = true;
  for (let i = 0; i < dim; i++) {
    const idx = i * dim + (dim - 1 - i);
    diag2Indices.push(idx);
    if (!markedSet.has(board[idx])) {
      diag2Complete = false;
    }
  }
  if (diag2Complete) {
    completedLines.push({ type: 'diag', index: 2, cells: diag2Indices });
  }

  return {
    count: completedLines.length,
    lines: completedLines
  };
}

// REST APIs
// 1. Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaders = await dbHelpers.getLeaderboard(15);
    res.json({ success: true, leaders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. User profile
app.get('/api/user/:username', async (req, res) => {
  try {
    const user = await dbHelpers.getUser(req.params.username);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Room info
app.get('/api/room/:code', async (req, res) => {
  try {
    const room = await dbHelpers.getRoom(req.params.code);
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
    const players = await dbHelpers.getRoomPlayers(req.params.code);
    res.json({
      success: true,
      room: {
        room_code: room.room_code,
        host_username: room.host_username,
        matrix_size: room.matrix_size,
        win_lines: room.win_lines,
        status: room.status,
        player_count: players.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// In-memory socket mapping for quick cleanup
const socketToUser = new Map(); // socket.id -> { username, roomCode }

// Socket.IO Real-time Events
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Register user or get user
  socket.on('init_user', async ({ username, avatarColor }, callback) => {
    try {
      const cleanName = (username || '').trim().substring(0, 20);
      if (!cleanName) {
        return callback && callback({ success: false, error: 'Username is required' });
      }
      const user = await dbHelpers.getOrCreateUser(cleanName, avatarColor || '#6366f1');
      callback && callback({ success: true, user });
    } catch (err) {
      console.error('init_user error:', err);
      callback && callback({ success: false, error: 'Database error' });
    }
  });

  // Create room
  socket.on('create_room', async ({ username, matrixSize, winLines, avatarColor }, callback) => {
    try {
      const cleanName = (username || '').trim();
      if (!cleanName) {
        return callback && callback({ success: false, error: 'Username required' });
      }

      const size = Number(matrixSize) === 100 ? 100 : 25;
      const targetLines = winLines ? Number(winLines) : 5;
      const roomCode = generateRoomCode();

      await dbHelpers.getOrCreateUser(cleanName, avatarColor);
      await dbHelpers.createRoom(roomCode, cleanName, size, targetLines);

      // Host joins the room
      socket.join(roomCode);
      socketToUser.set(socket.id, { username: cleanName, roomCode });

      await dbHelpers.joinRoomPlayer(roomCode, socket.id, cleanName, []);

      const room = await dbHelpers.getRoom(roomCode);
      const players = await dbHelpers.getRoomPlayers(roomCode);

      callback && callback({ success: true, roomCode, room, players });
      io.to(roomCode).emit('room_updated', { room, players });
    } catch (err) {
      console.error('create_room error:', err);
      callback && callback({ success: false, error: 'Failed to create room' });
    }
  });

  // Join room
  socket.on('join_room', async ({ username, roomCode, avatarColor }, callback) => {
    try {
      const cleanName = (username || '').trim();
      const cleanCode = (roomCode || '').trim().toUpperCase();

      if (!cleanName || !cleanCode) {
        return callback && callback({ success: false, error: 'Name and Team Code are required' });
      }

      const room = await dbHelpers.getRoom(cleanCode);
      if (!room) {
        return callback && callback({ success: false, error: 'Team room not found! Please check the code.' });
      }

      await dbHelpers.getOrCreateUser(cleanName, avatarColor);
      socket.join(cleanCode);
      socketToUser.set(socket.id, { username: cleanName, roomCode: cleanCode });

      await dbHelpers.joinRoomPlayer(cleanCode, socket.id, cleanName, []);

      const players = await dbHelpers.getRoomPlayers(cleanCode);

      callback && callback({ success: true, room, players });
      io.to(cleanCode).emit('room_updated', { room, players });
      io.to(cleanCode).emit('system_message', `${cleanName} joined the game!`);
    } catch (err) {
      console.error('join_room error:', err);
      callback && callback({ success: false, error: 'Failed to join room' });
    }
  });

  // Start game (Host only)
  socket.on('start_game', async ({ roomCode }, callback) => {
    try {
      const cleanCode = (roomCode || '').trim().toUpperCase();
      const room = await dbHelpers.getRoom(cleanCode);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      const userInfo = socketToUser.get(socket.id);
      if (!userInfo || userInfo.username.toLowerCase() !== room.host_username.toLowerCase()) {
        return callback && callback({ success: false, error: 'Only the team host can start the game!' });
      }

      const players = await dbHelpers.getRoomPlayers(cleanCode);
      if (players.length < 1) {
        return callback && callback({ success: false, error: 'Need players in the room' });
      }

      // Generate randomized boards for every single player
      const playerBoards = {};
      for (const p of players) {
        const board = generateRandomBoard(room.matrix_size);
        playerBoards[p.username.toLowerCase()] = board;
        await dbHelpers.setPlayerBoard(cleanCode, p.username, board);
      }

      // Generate RANDOM player turn order
      const playerUsernames = players.map(p => p.username);
      const randomizedTurnOrder = shuffleArray(playerUsernames);

      // Start game in DB
      await dbHelpers.startGame(cleanCode, randomizedTurnOrder);

      const updatedRoom = await dbHelpers.getRoom(cleanCode);
      const updatedPlayers = await dbHelpers.getRoomPlayers(cleanCode);

      // Send personalized game_start with individual randomized board to each player
      updatedPlayers.forEach(p => {
        if (p.socket_id) {
          const userBoard = playerBoards[p.username.toLowerCase()];
          io.to(p.socket_id).emit('game_started', {
            room: updatedRoom,
            players: updatedPlayers,
            myBoard: userBoard,
            turnOrder: randomizedTurnOrder,
            currentTurnPlayer: randomizedTurnOrder[0],
            matrixSize: room.matrix_size,
            winLines: room.win_lines
          });
        }
      });

      io.to(cleanCode).emit('system_message', `Game started! Random turn order: ${randomizedTurnOrder.join(' → ')}`);
      callback && callback({ success: true });
    } catch (err) {
      console.error('start_game error:', err);
      callback && callback({ success: false, error: 'Failed to start game' });
    }
  });

  // Rejoin / Sync game (e.g. after refresh)
  socket.on('sync_game', async ({ roomCode, username }, callback) => {
    try {
      const cleanCode = (roomCode || '').trim().toUpperCase();
      const cleanName = (username || '').trim();

      const room = await dbHelpers.getRoom(cleanCode);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      socket.join(cleanCode);
      socketToUser.set(socket.id, { username: cleanName, roomCode: cleanCode });
      await dbHelpers.joinRoomPlayer(cleanCode, socket.id, cleanName, []);

      const players = await dbHelpers.getRoomPlayers(cleanCode);
      const me = players.find(p => p.username.toLowerCase() === cleanName.toLowerCase());

      callback && callback({
        success: true,
        room,
        players,
        myBoard: me ? me.matrix_board : [],
        calledNumbers: room.called_numbers,
        turnOrder: room.turn_order,
        currentTurnPlayer: room.turn_order[room.current_turn_index] || null
      });
    } catch (err) {
      console.error('sync_game error:', err);
      callback && callback({ success: false, error: 'Sync failed' });
    }
  });

  // Call number (Cross-out for everyone)
  socket.on('call_number', async ({ roomCode, number }, callback) => {
    try {
      const cleanCode = (roomCode || '').trim().toUpperCase();
      const num = parseInt(number, 10);

      const room = await dbHelpers.getRoom(cleanCode);
      if (!room || room.status !== 'playing') {
        return callback && callback({ success: false, error: 'Game is not active' });
      }

      const userInfo = socketToUser.get(socket.id);
      if (!userInfo) {
        return callback && callback({ success: false, error: 'User not recognized' });
      }

      // Verify turn
      const currentTurnPlayer = room.turn_order[room.current_turn_index];
      if (!currentTurnPlayer || currentTurnPlayer.toLowerCase() !== userInfo.username.toLowerCase()) {
        return callback && callback({ success: false, error: `It is ${currentTurnPlayer}'s turn!` });
      }

      // Verify number range
      if (isNaN(num) || num < 1 || num > room.matrix_size) {
        return callback && callback({ success: false, error: `Number must be between 1 and ${room.matrix_size}` });
      }

      // Check if already called
      if (room.called_numbers.includes(num)) {
        return callback && callback({ success: false, error: `Number ${num} was already called!` });
      }

      // Add to called numbers
      const updatedCalled = [...room.called_numbers, num];
      const turnNumber = updatedCalled.length;

      // Next player turn index
      const nextTurnIndex = (room.current_turn_index + 1) % room.turn_order.length;
      const nextTurnPlayer = room.turn_order[nextTurnIndex];

      await dbHelpers.recordCall(cleanCode, userInfo.username, num, turnNumber, updatedCalled, nextTurnIndex);

      // Now check line completion and win condition for every player
      const players = await dbHelpers.getRoomPlayers(cleanCode);
      const playerStats = [];
      let winner = null;

      for (const p of players) {
        const lineCalc = calculateLines(p.matrix_board, room.matrix_size, updatedCalled);
        const hasWon = lineCalc.count >= room.win_lines;
        await dbHelpers.updatePlayerLines(cleanCode, p.username, lineCalc.count, hasWon);

        playerStats.push({
          username: p.username,
          completedLines: lineCalc.count,
          hasWon,
          completedLineDetails: lineCalc.lines
        });

        if (hasWon && !winner) {
          winner = p.username;
        }
      }

      // If there is a winner, finish game
      if (winner) {
        await dbHelpers.finishGame(cleanCode, winner, players);
      }

      // Broadcast number call and automatic cancellation to ALL players in the room
      io.to(cleanCode).emit('number_called', {
        calledNumber: num,
        calledBy: userInfo.username,
        allCalledNumbers: updatedCalled,
        currentTurnPlayer: nextTurnPlayer,
        currentTurnIndex: nextTurnIndex,
        playerStats,
        winner,
        turnNumber
      });

      if (winner) {
        io.to(cleanCode).emit('game_over', {
          winner,
          winningLines: room.win_lines,
          playerStats
        });
        io.to(cleanCode).emit('system_message', `🎉 BINGO! ${winner} has won the game with ${room.win_lines} completed lines!`);
      } else {
        io.to(cleanCode).emit('system_message', `${userInfo.username} called [${num}]. Next turn: ${nextTurnPlayer}`);
      }

      callback && callback({ success: true });
    } catch (err) {
      console.error('call_number error:', err);
      callback && callback({ success: false, error: 'Failed to call number' });
    }
  });

  // Rematch / Play Again
  socket.on('rematch', async ({ roomCode }, callback) => {
    try {
      const cleanCode = (roomCode || '').trim().toUpperCase();
      const room = await dbHelpers.getRoom(cleanCode);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      await dbHelpers.resetRoom(cleanCode);
      const players = await dbHelpers.getRoomPlayers(cleanCode);

      // Generate fresh random boards for everyone
      const playerBoards = {};
      for (const p of players) {
        const board = generateRandomBoard(room.matrix_size);
        playerBoards[p.username.toLowerCase()] = board;
        await dbHelpers.setPlayerBoard(cleanCode, p.username, board);
      }

      // Roll a fresh random turn order
      const playerUsernames = players.map(p => p.username);
      const randomizedTurnOrder = shuffleArray(playerUsernames);

      await dbHelpers.startGame(cleanCode, randomizedTurnOrder);
      const updatedRoom = await dbHelpers.getRoom(cleanCode);
      const updatedPlayers = await dbHelpers.getRoomPlayers(cleanCode);

      updatedPlayers.forEach(p => {
        if (p.socket_id) {
          const userBoard = playerBoards[p.username.toLowerCase()];
          io.to(p.socket_id).emit('game_started', {
            room: updatedRoom,
            players: updatedPlayers,
            myBoard: userBoard,
            turnOrder: randomizedTurnOrder,
            currentTurnPlayer: randomizedTurnOrder[0],
            matrixSize: room.matrix_size,
            winLines: room.win_lines
          });
        }
      });

      io.to(cleanCode).emit('system_message', `New round started! Random turn order: ${randomizedTurnOrder.join(' → ')}`);
      callback && callback({ success: true });
    } catch (err) {
      console.error('rematch error:', err);
      callback && callback({ success: false, error: 'Failed to restart game' });
    }
  });

  // Chat / Quick reaction
  socket.on('send_chat', ({ roomCode, message }) => {
    const userInfo = socketToUser.get(socket.id);
    if (!userInfo || !message) return;
    const cleanMsg = (message || '').trim().substring(0, 100);
    io.to(roomCode).emit('chat_message', {
      username: userInfo.username,
      message: cleanMsg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Disconnect handler
  socket.on('disconnect', async () => {
    const userInfo = socketToUser.get(socket.id);
    if (userInfo) {
      console.log(`[Socket] ${userInfo.username} disconnected from ${userInfo.roomCode}`);
      socketToUser.delete(socket.id);

      try {
        const room = await dbHelpers.getRoom(userInfo.roomCode);
        if (room && room.status === 'waiting') {
          await dbHelpers.removePlayer(userInfo.roomCode, userInfo.username);
          const updatedPlayers = await dbHelpers.getRoomPlayers(userInfo.roomCode);
          io.to(userInfo.roomCode).emit('room_updated', { room, players: updatedPlayers });
          io.to(userInfo.roomCode).emit('system_message', `${userInfo.username} left the lobby.`);
        }
      } catch (err) {
        console.error('disconnect cleanup error:', err);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` Bingo Game Server running on http://localhost:${PORT}`);
  console.log(` SQLite Database: bingo.db connected`);
  console.log(` Real-time WebSockets: Active`);
  console.log(`===============================================`);
});
