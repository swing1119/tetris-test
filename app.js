const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.querySelector('#next-canvas');
const nextCtx = nextCanvas.getContext('2d');

const COLS = 10;
const ROWS = 20;
const CELL = canvas.width / COLS;
const SCORE_TABLE = [0, 100, 300, 500, 800];
const COLORS = {
  I: '#50d9db',
  O: '#f4c95d',
  T: '#b77bff',
  S: '#70d68a',
  Z: '#ff6f83',
  J: '#5b9dff',
  L: '#ff9c63'
};
const GLOW_COLORS = {
  I: '#8affef', O: '#ffe99b', T: '#d7b8ff', S: '#adf5b2', Z: '#ffadb9', J: '#a5c8ff', L: '#ffd0ac'
};
const PIECES = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 3, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }
};

let board = createBoard();
let current = null;
let nextType = null;
let bag = [];
let score = 0;
let lines = 0;
let level = 1;
let highScore = readHighScore();
let state = 'menu';
let muted = false;
let lastTime = 0;
let dropTimer = 0;
let audioContext = null;

const $ = (selector) => document.querySelector(selector);
const scoreValue = $('#score-value');
const bestValue = $('#best-value');
const linesValue = $('#lines-value');
const levelValue = $('#level-value');
const speedValue = $('#speed-value');
const speedLabel = $('#speed-label');
const progressText = $('#progress-text');
const progressBar = $('#progress-bar');
const overlay = $('#game-overlay');
const overlayContent = $('#overlay-content');

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function readHighScore() {
  try { return Number(localStorage.getItem('tetris-high-score')) || 0; } catch { return 0; }
}

function saveHighScore() {
  try { localStorage.setItem('tetris-high-score', String(highScore)); } catch { /* storage may be unavailable */ }
}

function refillBag() {
  bag = Object.keys(PIECES);
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function drawType() {
  if (!bag.length) refillBag();
  return bag.pop();
}

function createPiece(type) {
  const definition = PIECES[type];
  const width = definition.size;
  return {
    type,
    cells: definition.cells.map(([x, y]) => [x, y]),
    size: definition.size,
    x: Math.floor((COLS - width) / 2),
    y: 0
  };
}

function resetGame() {
  board = createBoard();
  bag = [];
  current = null;
  nextType = drawType();
  score = 0;
  lines = 0;
  level = 1;
  dropTimer = 0;
  spawnPiece();
  updateHud();
  render();
}

function startGame() {
  resetGame();
  state = 'playing';
  hideOverlay();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
  beep(520, 0.06);
}

function gameLoop(time) {
  if (state !== 'playing') return;
  const delta = Math.min(time - lastTime, 100);
  lastTime = time;
  dropTimer += delta;
  if (dropTimer >= getDropInterval()) {
    dropTimer = 0;
    stepDown(false);
  }
  render();
  requestAnimationFrame(gameLoop);
}

function getDropInterval() {
  return Math.max(90, 720 - (level - 1) * 55);
}

function spawnPiece() {
  current = createPiece(nextType || drawType());
  nextType = drawType();
  if (collides(current, current.x, current.y, current.cells)) endGame();
}

function getCells(piece = current, cells = piece.cells) {
  return cells.map(([x, y]) => [x + piece.x, y + piece.y]);
}

function collides(piece, x, y, cells = piece.cells) {
  return cells.some(([cellX, cellY]) => {
    const boardX = cellX + x;
    const boardY = cellY + y;
    return boardX < 0 || boardX >= COLS || boardY >= ROWS || (boardY >= 0 && board[boardY][boardX]);
  });
}

function move(dx, dy) {
  if (!current || state !== 'playing' || collides(current, current.x + dx, current.y + dy)) return false;
  current.x += dx;
  current.y += dy;
  return true;
}

function stepDown(fromPlayer) {
  if (move(0, 1)) {
    if (fromPlayer) addScore(1);
    return true;
  }
  lockPiece();
  return false;
}

function hardDrop() {
  if (state !== 'playing' || !current) return;
  let distance = 0;
  while (move(0, 1)) distance += 1;
  if (distance) addScore(distance * 2);
  lockPiece();
  beep(150, 0.05);
}

function rotate() {
  if (state !== 'playing' || !current || current.type === 'O') return;
  const rotated = current.cells.map(([x, y]) => [current.size - 1 - y, x]);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides(current, current.x + kick, current.y, rotated)) {
      current.cells = rotated;
      current.x += kick;
      beep(410, 0.025);
      return;
    }
  }
}

function lockPiece() {
  if (!current) return;
  getCells().forEach(([x, y]) => {
    if (y >= 0 && y < ROWS) board[y][x] = current.type;
  });
  const removed = clearLines();
  if (removed > 0) {
    const previousLevel = level;
    lines += removed;
    addScore(SCORE_TABLE[removed]);
    level = Math.floor(lines / 10) + 1;
    beep(removed === 4 ? 760 : 610, 0.1);
    if (level > previousLevel) beep(900, 0.08);
  }
  spawnPiece();
  updateHud();
}

function clearLines() {
  const remaining = board.filter((row) => row.some((cell) => !cell));
  const removed = ROWS - remaining.length;
  while (remaining.length < ROWS) remaining.unshift(Array(COLS).fill(null));
  board = remaining;
  return removed;
}

function addScore(points) {
  score += points;
  if (score > highScore) {
    highScore = score;
    saveHighScore();
  }
  updateHud();
}

function endGame() {
  state = 'over';
  current = null;
  saveHighScore();
  beep(110, 0.18);
  showGameOverOverlay();
  updateHud();
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showPauseOverlay();
  } else if (state === 'paused') {
    state = 'playing';
    lastTime = performance.now();
    hideOverlay();
    requestAnimationFrame(gameLoop);
  }
}

function showStartOverlay() {
  overlayContent.innerHTML = `
    <div class="overlay-kicker">READY WHEN YOU ARE</div>
    <h3>게임을 시작할까요?</h3>
    <p>블록을 빈틈없이 쌓아<br />가장 높은 기록에 도전해 보세요.</p>
    <button class="primary-button" data-overlay-action="start">게임 시작</button>
    <button class="secondary-button" data-overlay-action="howto">조작 방법 보기</button>`;
  overlay.classList.remove('hidden');
}

function showPauseOverlay() {
  overlayContent.innerHTML = `
    <div class="overlay-kicker">SESSION PAUSED</div>
    <h3>잠시 멈췄어요.</h3>
    <p>호흡을 고르고, 준비되면<br />다시 흐름을 이어가세요.</p>
    <button class="primary-button" data-overlay-action="resume">계속하기</button>
    <button class="secondary-button" data-overlay-action="restart">새 게임</button>`;
  overlay.classList.remove('hidden');
}

function showGameOverOverlay() {
  overlayContent.innerHTML = `
    <div class="overlay-kicker">SESSION COMPLETE</div>
    <h3>게임 오버</h3>
    <p>이번 플레이의 기록입니다.</p>
    <div class="result-row"><span>FINAL SCORE</span><strong>${formatNumber(score)}</strong></div>
    <div class="result-row"><span>LINES CLEARED</span><strong>${String(lines).padStart(3, '0')}</strong></div>
    <button class="primary-button" data-overlay-action="restart">다시 시작</button>
    <button class="secondary-button" data-overlay-action="home">처음 화면</button>`;
  overlay.classList.remove('hidden');
}

function hideOverlay() { overlay.classList.add('hidden'); }

function updateHud() {
  scoreValue.textContent = formatNumber(score);
  bestValue.textContent = formatNumber(highScore);
  linesValue.textContent = String(lines).padStart(3, '0');
  levelValue.textContent = String(level).padStart(2, '0');
  speedValue.textContent = String(level).padStart(2, '0');
  speedLabel.textContent = level < 3 ? 'WARM UP' : level < 6 ? 'IN FLOW' : 'FULL FOCUS';
  const progress = lines % 10;
  progressText.textContent = `${progress} / 10`;
  progressBar.style.width = `${progress * 10}%`;
}

function formatNumber(number) { return String(number).padStart(6, '0'); }

function drawCell(context, x, y, size, type, alpha = 1, mini = false) {
  const color = COLORS[type];
  context.save();
  context.globalAlpha = alpha;
  const padding = mini ? 2 : 1.5;
  const left = x * size + padding;
  const top = y * size + padding;
  const width = size - padding * 2;
  const gradient = context.createLinearGradient(left, top, left + width, top + width);
  gradient.addColorStop(0, GLOW_COLORS[type]);
  gradient.addColorStop(.28, color);
  gradient.addColorStop(1, color);
  context.fillStyle = gradient;
  context.shadowColor = color;
  context.shadowBlur = mini ? 5 : 8;
  context.beginPath();
  context.roundRect(left, top, width, width, Math.max(2, size * .08));
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,.22)';
  context.beginPath();
  context.roundRect(left + width * .16, top + width * .13, width * .57, Math.max(1.5, width * .1), 2);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,.16)';
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

function drawBoardGrid() {
  ctx.fillStyle = '#081523';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(150, 190, 211, .075)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x += 1) {
    ctx.beginPath(); ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL + .5); ctx.lineTo(canvas.width, y * CELL + .5); ctx.stroke();
  }
}

function render() {
  drawBoardGrid();
  board.forEach((row, y) => row.forEach((type, x) => { if (type) drawCell(ctx, x, y, CELL, type); }));
  if (current && state !== 'over') {
    const ghostDistance = getGhostDistance();
    getCells(current, current.cells).forEach(([x, y]) => drawCell(ctx, x, y + ghostDistance, CELL, current.type, .16));
    getCells().forEach(([x, y]) => { if (y >= 0) drawCell(ctx, x, y, CELL, current.type); });
  }
  drawNextPiece();
}

function getGhostDistance() {
  let distance = 0;
  while (!collides(current, current.x, current.y + distance + 1)) distance += 1;
  return distance;
}

function drawNextPiece() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = 'rgba(5, 15, 26, .16)';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextType) return;
  const piece = createPiece(nextType);
  const miniCell = 25;
  const minX = Math.min(...piece.cells.map(([x]) => x));
  const maxX = Math.max(...piece.cells.map(([x]) => x));
  const minY = Math.min(...piece.cells.map(([, y]) => y));
  const maxY = Math.max(...piece.cells.map(([, y]) => y));
  const offsetX = (nextCanvas.width / miniCell - (maxX - minX + 1)) / 2 - minX;
  const offsetY = (nextCanvas.height / miniCell - (maxY - minY + 1)) / 2 - minY;
  piece.cells.forEach(([x, y]) => drawCell(nextCtx, x + offsetX, y + offsetY, miniCell, nextType, 1, true));
}

function handleAction(action) {
  if (action === 'left') move(-1, 0);
  if (action === 'right') move(1, 0);
  if (action === 'down') stepDown(true);
  if (action === 'rotate') rotate();
  if (action === 'drop') hardDrop();
  render();
}

function beep(frequency, duration) {
  if (muted) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* audio is an enhancement, not a requirement */ }
}

function setMute() {
  muted = !muted;
  const button = $('#sound-toggle');
  button.textContent = muted ? '◗' : '◖';
  button.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  button.setAttribute('aria-pressed', String(!muted));
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' ', 'p', 'escape', 'r'].includes(key)) event.preventDefault();
  if (key === 'arrowleft') handleAction('left');
  if (key === 'arrowright') handleAction('right');
  if (key === 'arrowdown') handleAction('down');
  if (key === 'arrowup') handleAction('rotate');
  if (key === ' ') handleAction('drop');
  if (key === 'p' || key === 'escape') togglePause();
  if (key === 'r' && state !== 'playing') startGame();
  if (key === 'enter' && state === 'menu') startGame();
});

document.addEventListener('click', (event) => {
  const action = event.target.dataset.overlayAction;
  if (action === 'start' || action === 'restart') startGame();
  if (action === 'resume') togglePause();
  if (action === 'home') { state = 'menu'; resetGame(); showStartOverlay(); }
  if (action === 'howto') {
    overlayContent.innerHTML = `<div class="overlay-kicker">CONTROLS</div><h3>이렇게 조작해요.</h3><p>← → 이동 · ↑ 회전<br />↓ 빠르게 내리기 · SPACE 즉시 내리기<br />P 또는 ESC 일시정지</p><button class="primary-button" data-overlay-action="start">게임 시작</button>`;
  }
  if (event.target.dataset.action) handleAction(event.target.dataset.action);
});

$('#pause-button').addEventListener('click', togglePause);
$('#sound-toggle').addEventListener('click', setMute);

resetGame();
showStartOverlay();
render();
