# 🎯 Real-Time Multiplayer Bingo Game

A modern, responsive, real-time multiplayer Bingo game with team code generation, customizable square matrices (25 numbers 5×5 or 100 numbers 10×10), randomized turn order, automatic live cross-canceling across all players' screens, and persistent SQLite database integration.

---

## ✨ Key Features

- **No Passwords or Complex Registration**:
  - Players simply enter their nickname and pick an avatar color to play.
- **Team Code System**:
  - **Host a Game**: Choose your matrix configuration (25 Numbers or 100 Numbers, lines to win) and click **"Generate Team Code"** to create a private room (e.g., `TEAM-7491`).
  - **Join Friends**: Enter another player's team code or open a shareable link (`?room=TEAM-7491`) to jump right in.
- **Configurable Square Matrix Options**:
  - **25 Numbers (5×5 Grid)**: Classic B-I-N-G-O (1 to 25) with glowing letters (B-I-N-G-O) lighting up as lines are completed.
  - **100 Numbers (10×10 Grid)**: Mega matrix (1 to 100) for intense team competition with progress bar.
- **Random Matrix for Every Player**:
  - Every player's board is generated with a completely unique, randomized permutation of numbers every round.
- **Randomized Player Turn Order**:
  - When the host starts the match, the server shuffles all joined players to determine a random turn order.
  - Clear visual indicator shows whose turn it is.
- **Automatic Cross-Out / Cancellation**:
  - When the active player calls/enters a number on their turn, that number **automatically cancels and strikes out across all players' boards in real time**.
- **Real-Time Line Detection & Standings**:
  - Automatically detects completed rows, columns, and diagonals.
  - In 5×5: Each line lights up one letter of **B - I - N - G - O**.
  - Live team leaderboard shows opponents' completed lines in real-time.
- **Persistent SQLite Database**:
  - Tracks player profiles, matches, winning stats, turn history, and an all-time Leaderboard (`bingo.db`).
- **Sound Effects & Confetti Celebration**:
  - Built-in Web Audio API sounds (pop, chime, fanfare) with a mute toggle.
  - Confetti celebration upon winning BINGO.
  - "Play Again" button for immediate rematches with new random boards and fresh turn order.

---

## 🛠️ Technical Stack

- **Backend**: Node.js, Express.js
- **Real-Time Communication**: Socket.IO (WebSockets)
- **Database**: SQLite3 (`bingo.db`)
- **Frontend**: HTML5, Modern CSS (Glassmorphism, responsive grid), Vanilla JavaScript (Zero framework bloat)
- **Audio & FX**: Web Audio API synthesis, Canvas Confetti

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

### 3. Open in Browser
Open your browser and navigate to:
```
http://localhost:3000
```

To test multiplayer, open multiple tabs or windows, enter different nicknames, generate a team code in one tab, and join using that team code in the other tabs!
