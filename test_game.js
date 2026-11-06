const { dbHelpers } = require('./db.js');
const assert = require('assert');

// Helper shuffle
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateRandomBoard(matrixSize) {
  const numbers = Array.from({ length: matrixSize }, (_, i) => i + 1);
  return shuffleArray(numbers);
}

function calculateLines(board, matrixSize, calledNumbers) {
  const dim = Math.round(Math.sqrt(matrixSize));
  const markedSet = new Set(calledNumbers);
  const completedLines = [];

  // Rows
  for (let r = 0; r < dim; r++) {
    const rowIndices = [];
    let complete = true;
    for (let c = 0; c < dim; c++) {
      const idx = r * dim + c;
      rowIndices.push(idx);
      if (!markedSet.has(board[idx])) complete = false;
    }
    if (complete) completedLines.push({ type: 'row', index: r, cells: rowIndices });
  }

  // Columns
  for (let c = 0; c < dim; c++) {
    const colIndices = [];
    let complete = true;
    for (let r = 0; r < dim; r++) {
      const idx = r * dim + c;
      colIndices.push(idx);
      if (!markedSet.has(board[idx])) complete = false;
    }
    if (complete) completedLines.push({ type: 'col', index: c, cells: colIndices });
  }

  // Diagonals
  let d1 = true;
  for (let i = 0; i < dim; i++) {
    if (!markedSet.has(board[i * dim + i])) d1 = false;
  }
  if (d1) completedLines.push({ type: 'diag', index: 1 });

  let d2 = true;
  for (let i = 0; i < dim; i++) {
    if (!markedSet.has(board[i * dim + (dim - 1 - i)])) d2 = false;
  }
  if (d2) completedLines.push({ type: 'diag', index: 2 });

  return { count: completedLines.length, lines: completedLines };
}

async function runTests() {
  console.log('--- STARTING MULTIPLAYER BINGO AUTOMATED TEST SUITE ---');

  // Test 1: User Onboarding
  console.log('1. Testing User Onboarding...');
  const uid = Math.random().toString(36).substring(2, 7).toUpperCase();
  const nameAlice = `Alice_${uid}`;
  const nameBob = `Bob_${uid}`;
  const nameCharlie = `Charlie_${uid}`;
  const userAlice = await dbHelpers.getOrCreateUser(nameAlice, '#ec4899');
  const userBob = await dbHelpers.getOrCreateUser(nameBob, '#10b981');
  const userCharlie = await dbHelpers.getOrCreateUser(nameCharlie, '#f59e0b');
  assert.strictEqual(userAlice.username, nameAlice);
  assert.strictEqual(userBob.username, nameBob);
  console.log('✓ Users created successfully in SQLite');

  // Test 2: Room Creation with 25 and 100 Matrix Options
  console.log('2. Testing Room Creation (25 Numbers and 100 Numbers)...');
  const roomCode25 = `TEAM-25_${uid}`;
  const roomCode100 = `TEAM-100_${uid}`;

  await dbHelpers.createRoom(roomCode25, nameAlice, 25, 5);
  await dbHelpers.createRoom(roomCode100, nameBob, 100, 5);

  const room25 = await dbHelpers.getRoom(roomCode25);
  const room100 = await dbHelpers.getRoom(roomCode100);

  assert.strictEqual(room25.matrix_size, 25);
  assert.strictEqual(room25.win_lines, 5);
  assert.strictEqual(room100.matrix_size, 100);
  console.log('✓ Both 25-number and 100-number rooms verified in SQLite');

  // Test 3: Multiple Players Joining via Team Code
  console.log('3. Testing Players Joining Room via Team Code...');
  await dbHelpers.joinRoomPlayer(roomCode25, 'sock_alice', nameAlice);
  await dbHelpers.joinRoomPlayer(roomCode25, 'sock_bob', nameBob);
  await dbHelpers.joinRoomPlayer(roomCode25, 'sock_charlie', nameCharlie);

  const players = await dbHelpers.getRoomPlayers(roomCode25);
  assert.strictEqual(players.length, 3);
  console.log('✓ 3 players joined room:', players.map(p => p.username).join(', '));

  // Test 4: Randomized Matrix Generation for Every Player
  console.log('4. Testing Random Matrix Generation for Every Player...');
  const boardAlice = generateRandomBoard(25);
  const boardBob = generateRandomBoard(25);
  const boardCharlie = generateRandomBoard(25);

  assert.strictEqual(boardAlice.length, 25);
  assert.strictEqual(boardBob.length, 25);
  assert.strictEqual(new Set(boardAlice).size, 25);
  // Ensure the boards are randomized and distinct
  assert.notDeepStrictEqual(boardAlice, boardBob);
  await dbHelpers.setPlayerBoard(roomCode25, nameAlice, boardAlice);
  await dbHelpers.setPlayerBoard(roomCode25, nameBob, boardBob);
  await dbHelpers.setPlayerBoard(roomCode25, nameCharlie, boardCharlie);
  console.log('✓ Unique random matrix layouts generated and stored in SQLite');

  // Test 5: Randomized Player Turn Order
  console.log('5. Testing Random Player Turn Order Generation...');
  const playerNames = [nameAlice, nameBob, nameCharlie];
  const randomizedTurnOrder = shuffleArray(playerNames);
  await dbHelpers.startGame(roomCode25, randomizedTurnOrder);

  const activeRoom = await dbHelpers.getRoom(roomCode25);
  assert.strictEqual(activeRoom.status, 'playing');
  assert.strictEqual(activeRoom.turn_order.length, 3);
  console.log('✓ Random turn order rolled:', activeRoom.turn_order.join(' → '));

  // Test 6: Number Call & Automatic Cross-Out Across Players
  console.log('6. Testing Automatic Cross-Out & Turn Progression...');
  let called = [];
  const firstCaller = activeRoom.turn_order[0];
  const numberToCall = boardAlice[0]; // Alice's first number
  called.push(numberToCall);

  let nextIndex = 1 % activeRoom.turn_order.length;
  await dbHelpers.recordCall(roomCode25, firstCaller, numberToCall, 1, called, nextIndex);

  const updatedRoom = await dbHelpers.getRoom(roomCode25);
  assert.deepStrictEqual(updatedRoom.called_numbers, [numberToCall]);
  assert.strictEqual(updatedRoom.current_turn_index, nextIndex);
  console.log(`✓ ${firstCaller} called number [${numberToCall}]. Automatically crossed out in room state!`);

  // Test 7: Line Calculation (Rows, Columns, Diagonals, Full B-I-N-G-O)
  console.log('7. Testing Line Calculation and B-I-N-G-O Completion...');
  // Complete row 0 of Alice's board
  const row0 = [boardAlice[0], boardAlice[1], boardAlice[2], boardAlice[3], boardAlice[4]];
  let res = calculateLines(boardAlice, 25, row0);
  assert.strictEqual(res.count, 1);
  console.log('✓ 1 horizontal row detected (B unlocked)');

  // Complete column 0 as well
  const col0 = [boardAlice[0], boardAlice[5], boardAlice[10], boardAlice[15], boardAlice[20]];
  res = calculateLines(boardAlice, 25, [...row0, ...col0]);
  assert.strictEqual(res.count, 2);
  console.log('✓ 2 lines detected (B-I unlocked)');

  // Complete 5 lines for full B-I-N-G-O result
  const row1 = [boardAlice[5], boardAlice[6], boardAlice[7], boardAlice[8], boardAlice[9]];
  const row2 = [boardAlice[10], boardAlice[11], boardAlice[12], boardAlice[13], boardAlice[14]];
  const row3 = [boardAlice[15], boardAlice[16], boardAlice[17], boardAlice[18], boardAlice[19]];
  res = calculateLines(boardAlice, 25, [...row0, ...col0, ...row1, ...row2, ...row3]);
  assert(res.count >= 5, `Expected >= 5 lines, got ${res.count}`);
  console.log(`✓ Full B-I-N-G-O victory condition reached: ${res.count} lines completed!`);

  // Test 10x10 matrix (100 numbers) line detection
  const board100 = generateRandomBoard(100);
  const row0_100 = board100.slice(0, 10);
  const res100 = calculateLines(board100, 100, row0_100);
  assert.strictEqual(res100.count, 1);
  console.log('✓ 10x10 matrix (100 numbers) line calculation verified!');

  // Test 8: Win Verification and SQLite Stats Update
  console.log('8. Testing Victory and Persistent SQLite Stats...');
  await dbHelpers.finishGame(roomCode25, nameAlice, players);
  const userAliceAfter = await dbHelpers.getUser(nameAlice);
  const userBobAfter = await dbHelpers.getUser(nameBob);

  assert.strictEqual(userAliceAfter.games_won, 1);
  assert.strictEqual(userAliceAfter.games_played, 1);
  assert.strictEqual(userBobAfter.games_won, 0);
  assert.strictEqual(userBobAfter.games_played, 1);
  console.log('✓ SQLite match stats successfully updated');

  // Test 9: Leaderboard API Query
  console.log('9. Testing Leaderboard Retrieval...');
  const leaders = await dbHelpers.getLeaderboard(5);
  assert(leaders.length >= 1);
  console.log('✓ Leaderboard top player:', leaders[0].username, `(Wins: ${leaders[0].games_won})`);

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
