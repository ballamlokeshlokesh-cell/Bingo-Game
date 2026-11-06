const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'bingo.db');
const db = new sqlite3.Database(DB_PATH);

// Initialize database schema
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE COLLATE NOCASE,
      avatar_color TEXT,
      games_played INTEGER DEFAULT 0,
      games_won INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Rooms table
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_code TEXT PRIMARY KEY COLLATE NOCASE,
      host_username TEXT,
      matrix_size INTEGER DEFAULT 25,
      win_lines INTEGER DEFAULT 5,
      status TEXT DEFAULT 'waiting',
      winner_username TEXT,
      turn_order TEXT DEFAULT '[]',
      current_turn_index INTEGER DEFAULT 0,
      called_numbers TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Room players table
  db.run(`
    CREATE TABLE IF NOT EXISTS room_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT COLLATE NOCASE,
      socket_id TEXT,
      username TEXT COLLATE NOCASE,
      matrix_board TEXT DEFAULT '[]',
      completed_lines INTEGER DEFAULT 0,
      has_won INTEGER DEFAULT 0,
      is_ready INTEGER DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_code, username)
    )
  `);

  // Call history
  db.run(`
    CREATE TABLE IF NOT EXISTS call_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT COLLATE NOCASE,
      turn_number INTEGER,
      username TEXT,
      called_number INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Helper promises
const dbHelpers = {
  // Upsert user
  getOrCreateUser: (username, avatarColor = '#4f46e5') => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username], (err, row) => {
        if (err) return reject(err);
        if (row) return resolve(row);

        const id = 'user_' + Math.random().toString(36).substring(2, 9);
        db.run(
          'INSERT INTO users (id, username, avatar_color) VALUES (?, ?, ?)',
          [id, username, avatarColor],
          function (insertErr) {
            if (insertErr) return reject(insertErr);
            resolve({ id, username, avatar_color: avatarColor, games_played: 0, games_won: 0 });
          }
        );
      });
    });
  },

  // Get user profile
  getUser: (username) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  },

  // Get leaderboards
  getLeaderboard: (limit = 10) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT username, avatar_color, games_played, games_won FROM users ORDER BY games_won DESC, games_played DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
  },

  // Create room (upsert)
  createRoom: (roomCode, hostUsername, matrixSize = 25, winLines = 5) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO rooms (room_code, host_username, matrix_size, win_lines, status, turn_order, current_turn_index, called_numbers)
         VALUES (?, ?, ?, ?, 'waiting', '[]', 0, '[]')
         ON CONFLICT(room_code) DO UPDATE SET
           host_username = excluded.host_username,
           matrix_size = excluded.matrix_size,
           win_lines = excluded.win_lines,
           status = 'waiting',
           turn_order = '[]',
           current_turn_index = 0,
           called_numbers = '[]',
           winner_username = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [roomCode, hostUsername, matrixSize, winLines],
        function (err) {
          if (err) return reject(err);
          // Clear any stale players from an earlier test of the same room code
          db.run(
            `DELETE FROM room_players WHERE room_code = ? AND username != ? COLLATE NOCASE`,
            [roomCode, hostUsername],
            () => {
              resolve({
                room_code: roomCode,
                host_username: hostUsername,
                matrix_size: matrixSize,
                win_lines: winLines,
                status: 'waiting',
                turn_order: [],
                current_turn_index: 0,
                called_numbers: []
              });
            }
          );
        }
      );
    });
  },

  // Get room
  getRoom: (roomCode) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM rooms WHERE room_code = ? COLLATE NOCASE', [roomCode], (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        try {
          row.turn_order = JSON.parse(row.turn_order || '[]');
          row.called_numbers = JSON.parse(row.called_numbers || '[]');
        } catch (e) {
          row.turn_order = [];
          row.called_numbers = [];
        }
        resolve(row);
      });
    });
  },

  // Add or update player in room
  joinRoomPlayer: (roomCode, socketId, username, matrixBoard = []) => {
    return new Promise((resolve, reject) => {
      const boardStr = JSON.stringify(matrixBoard);
      db.run(
        `INSERT INTO room_players (room_code, socket_id, username, matrix_board, completed_lines, has_won, is_ready)
         VALUES (?, ?, ?, ?, 0, 0, 1)
         ON CONFLICT(room_code, username) DO UPDATE SET
           socket_id = excluded.socket_id,
           is_ready = 1`,
        [roomCode, socketId, username, boardStr],
        function (err) {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  },

  // Set player board
  setPlayerBoard: (roomCode, username, matrixBoard) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE room_players SET matrix_board = ? WHERE room_code = ? AND username = ? COLLATE NOCASE',
        [JSON.stringify(matrixBoard), roomCode, username],
        (err) => {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  },

  // Get room players
  getRoomPlayers: (roomCode) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT username, socket_id, matrix_board, completed_lines, has_won, is_ready FROM room_players WHERE room_code = ? COLLATE NOCASE',
        [roomCode],
        (err, rows) => {
          if (err) return reject(err);
          const players = (rows || []).map(p => {
            let board = [];
            try {
              board = JSON.parse(p.matrix_board || '[]');
            } catch (e) {
              board = [];
            }
            return {
              ...p,
              matrix_board: board
            };
          });
          resolve(players);
        }
      );
    });
  },

  // Remove player from room
  removePlayer: (roomCode, username) => {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM room_players WHERE room_code = ? AND username = ? COLLATE NOCASE',
        [roomCode, username],
        (err) => {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  },

  // Start game in room
  startGame: (roomCode, turnOrder) => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE rooms SET status = 'playing', turn_order = ?, current_turn_index = 0, called_numbers = '[]', winner_username = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE room_code = ? COLLATE NOCASE`,
        [JSON.stringify(turnOrder), roomCode],
        (err) => {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  },

  // Record called number
  recordCall: (roomCode, username, number, turnNumber, allCalledNumbers, nextTurnIndex) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO call_history (room_code, turn_number, username, called_number) VALUES (?, ?, ?, ?)`,
        [roomCode, turnNumber, username, number],
        (insertErr) => {
          if (insertErr) return reject(insertErr);
          db.run(
            `UPDATE rooms SET called_numbers = ?, current_turn_index = ?, updated_at = CURRENT_TIMESTAMP WHERE room_code = ? COLLATE NOCASE`,
            [JSON.stringify(allCalledNumbers), nextTurnIndex, roomCode],
            (updateErr) => {
              if (updateErr) return reject(updateErr);
              resolve(true);
            }
          );
        }
      );
    });
  },

  // Update player lines
  updatePlayerLines: (roomCode, username, completedLines, hasWon) => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE room_players SET completed_lines = ?, has_won = ? WHERE room_code = ? AND username = ? COLLATE NOCASE`,
        [completedLines, hasWon ? 1 : 0, roomCode, username],
        (err) => {
          if (err) return reject(err);
          resolve(true);
        }
      );
    });
  },

  // Finish game
  finishGame: (roomCode, winnerUsername, players) => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE rooms SET status = 'finished', winner_username = ?, updated_at = CURRENT_TIMESTAMP WHERE room_code = ? COLLATE NOCASE`,
        [winnerUsername, roomCode],
        (err) => {
          if (err) return reject(err);
          if (!players || players.length === 0) return resolve(true);

          let remaining = players.length;
          players.forEach(p => {
            const isWinner = p.username.toLowerCase() === winnerUsername.toLowerCase();
            db.run(
              `UPDATE users SET games_played = games_played + 1, games_won = games_won + ? WHERE username = ? COLLATE NOCASE`,
              [isWinner ? 1 : 0, p.username],
              (updateErr) => {
                if (updateErr) return reject(updateErr);
                remaining--;
                if (remaining === 0) resolve(true);
              }
            );
          });
        }
      );
    });
  },

  // Reset room for rematch
  resetRoom: (roomCode) => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE rooms SET status = 'waiting', turn_order = '[]', current_turn_index = 0, called_numbers = '[]', winner_username = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE room_code = ? COLLATE NOCASE`,
        [roomCode],
        (err) => {
          if (err) return reject(err);
          db.run(
            `UPDATE room_players SET matrix_board = '[]', completed_lines = 0, has_won = 0 WHERE room_code = ? COLLATE NOCASE`,
            [roomCode],
            (err2) => {
              if (err2) return reject(err2);
              resolve(true);
            }
          );
        }
      );
    });
  }
};

module.exports = { db, dbHelpers };
