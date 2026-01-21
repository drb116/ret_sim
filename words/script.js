// script.js

// ---------- Daily puzzle selection ----------
function localMidnightDays(d = new Date()) {
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(mid.getTime() / 86400000);
}

// Make "today" map to puzzle row 0 on this date
const START_ROW_ZERO_ON = new Date(2026, 0, 15);

const todayIdx = localMidnightDays(new Date());
const baseIdx = localMidnightDays(START_ROW_ZERO_ON);
const PUZZLE_ROW =
  ((todayIdx - baseIdx) % PUZZLES.length + PUZZLES.length) % PUZZLES.length;

const PUZZLE_WORDS = PUZZLES[PUZZLE_ROW].map((w) => w.toUpperCase());

// ---------- Confetti (no libraries) ----------
let confettiCanvas = null;
let confettiCtx = null;
let confettiParticles = [];
let confettiAnimId = null;

function ensureConfettiCanvas() {
  if (confettiCanvas) return;

  confettiCanvas = document.createElement("canvas");
  confettiCanvas.id = "confettiCanvas";
  confettiCanvas.style.position = "fixed";
  confettiCanvas.style.inset = "0";
  confettiCanvas.style.width = "100vw";
  confettiCanvas.style.height = "100vh";
  confettiCanvas.style.pointerEvents = "none";
  confettiCanvas.style.zIndex = "999999";
  document.body.appendChild(confettiCanvas);

  confettiCtx = confettiCanvas.getContext("2d");

  const resize = () => {
    // handle DPR so it's crisp
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    confettiCanvas.width = Math.floor(window.innerWidth * dpr);
    confettiCanvas.height = Math.floor(window.innerHeight * dpr);
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  window.addEventListener("resize", resize);
  resize();
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function makeConfettiParticle() {
  // Use your row colors as the palette (matches your board)
  const colors = ["#caf9b8", "#f8e8b7", "#c2dafc", "#fdc3d0", "#ffffff"];
  const size = rand(6, 12);

  return {
    x: rand(0, window.innerWidth),
    y: rand(-window.innerHeight * 0.2, -20),
    vx: rand(-1.2, 1.2),
    vy: rand(2.0, 5.0),
    rot: rand(0, Math.PI * 2),
    vr: rand(-0.12, 0.12),
    w: size,
    h: size * rand(0.6, 1.4),
    color: colors[Math.floor(rand(0, colors.length))],
    life: rand(120, 220), // frames-ish
  };
}

function startConfetti({ durationMs = 3500, burst = 180 } = {}) {
  ensureConfettiCanvas();

  // Stop any previous animation cleanly
  if (confettiAnimId) {
    cancelAnimationFrame(confettiAnimId);
    confettiAnimId = null;
  }

  confettiParticles = [];
  for (let i = 0; i < burst; i++) confettiParticles.push(makeConfettiParticle());

  const startTime = performance.now();

  const tick = (t) => {
    const elapsed = t - startTime;

    confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.vx *= 0.995; // slight damping
      p.vy = Math.min(p.vy + 0.02, 8); // gravity-ish
      p.life -= 1;

      // draw (rotated rectangle)
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      confettiCtx.restore();

      // remove if dead or offscreen
      if (p.life <= 0 || p.y > window.innerHeight + 30) {
        confettiParticles.splice(i, 1);
      }
    }

    // keep spawning a few new ones while within duration
    if (elapsed < durationMs) {
      // trickle
      for (let i = 0; i < 4; i++) confettiParticles.push(makeConfettiParticle());
      confettiAnimId = requestAnimationFrame(tick);
      return;
    }

    // finish: let remaining particles fall out for a short tail
    if (confettiParticles.length > 0) {
      confettiAnimId = requestAnimationFrame(tick);
      return;
    }

    // cleanup canvas (leave it attached but cleared)
    confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    confettiAnimId = null;
  };

  confettiAnimId = requestAnimationFrame(tick);
}

function stopConfetti() {
  if (!confettiCanvas || !confettiCtx) return;
  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  confettiAnimId = null;
  confettiParticles = [];
  confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}


// ---------- Validation + board model ----------
function uniqueLetters(words) {
  const s = new Set();
  for (const w of words) for (const ch of w) s.add(ch);
  return s;
}

function lettersByPosition(words) {
  const cols = Array.from({ length: 5 }, () => new Set());
  for (const w of words) {
    for (let i = 0; i < 5; i++) cols[i].add(w[i]);
  }
  return cols;
}

function validatePuzzle(words) {
  if (!Array.isArray(words) || words.length < 2 || words.length > 4)
    return { ok: false, msg: "Puzzle must have 2–4 words." };
  if (words.some((w) => typeof w !== "string" || w.length !== 5))
    return { ok: false, msg: "All words must be 5 letters." };

  const uniq = uniqueLetters(words);
  if (uniq.size !== 8)
    return {
      ok: false,
      msg: `Puzzle must have exactly 8 unique letters (has ${uniq.size}).`,
    };

  const cols = lettersByPosition(words);
  if (cols.some((set) => set.size < 1 || set.size > 4))
    return { ok: false, msg: "Each position must have 1–4 possible letters." };

  return { ok: true, cols, uniq };
}

const puzzleCheck = validatePuzzle(PUZZLE_WORDS);
if (!puzzleCheck.ok) {
  console.error("Invalid puzzle:", PUZZLE_WORDS, puzzleCheck.msg);
}

const EXPECTED_COLS = puzzleCheck.ok
  ? puzzleCheck.cols
  : lettersByPosition(["ABCDE", "FGHIJ"]);

const TILE_LETTERS = puzzleCheck.ok
  ? Array.from(puzzleCheck.uniq)
  : ["A", "B", "C", "D", "E", "F", "G", "H"];

// ---------- Seeded shuffle (deterministic per day + puzzle row) ----------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------- DOM refs ----------
const boardEl = document.getElementById("board");
const trayEl = document.getElementById("tray");
const puzzleWordsEl = document.getElementById("puzzleWords");
const resetBtn = document.getElementById("resetBtn");
const checkBtn = document.getElementById("checkBtn");

// Optional: show words (debug). Leave blank for “hidden”
if (puzzleWordsEl) puzzleWordsEl.textContent = "";

// ---------- Row color helpers ----------
function rowColorVar(rowIndex1Based) {
  return `var(--row${rowIndex1Based})`;
}

function applyRowColorsToSlot(slot, rows) {
  slot.dataset.n = String(rows.length);
  slot.style.setProperty("--c1", rowColorVar(rows[0]));
  if (rows[1]) slot.style.setProperty("--c2", rowColorVar(rows[1]));
  if (rows[2]) slot.style.setProperty("--c3", rowColorVar(rows[2]));
  if (rows[3]) slot.style.setProperty("--c4", rowColorVar(rows[3]));
}

// ---------- Drag data helpers (desktop HTML5 DnD) ----------
function setDragData(ev, obj) {
  try {
    ev.dataTransfer.setData("application/json", JSON.stringify(obj));
  } catch {}
}

function getDragData(ev) {
  try {
    const raw = ev.dataTransfer.getData("application/json");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------- Check solution (row-group aware) ----------
function slotsInColumn(colIndex) {
  const colEl = boardEl.querySelector(`.col[data-col="${colIndex}"]`);
  return colEl ? Array.from(colEl.querySelectorAll(".slot")) : [];
}

function slotAppliesToRow(slot, rowIndex1Based) {
  const rows = (slot.dataset.rows || "")
    .split(",")
    .map((x) => parseInt(x, 10));
  return rows.includes(rowIndex1Based);
}

function buildWordsFromBoard() {
  const wordCount = PUZZLE_WORDS.length;
  const built = [];

  // Must have a tile in EVERY board slot
  for (let col = 0; col < 5; col++) {
    for (const s of slotsInColumn(col)) {
      if (!s.querySelector(".tile")) return null;
    }
  }

  // Build each word row-by-row
  for (let r = 1; r <= wordCount; r++) {
    let word = "";
    for (let col = 0; col < 5; col++) {
      const colSlots = slotsInColumn(col);

      const targetSlot = colSlots.find((s) => slotAppliesToRow(s, r));
      if (!targetSlot) return null;

      const tile = targetSlot.querySelector(".tile");
      if (!tile) return null;

      word += tile.textContent;
    }
    built.push(word);
  }

  return built;
}

function isSolved() {
  const built = buildWordsFromBoard();
  if (!built) return false;

  const attempt = [...built].sort().join("|");
  const solution = [...PUZZLE_WORDS].sort().join("|");
  return attempt === solution;
}

// ---------- Auto-congrats (NEW) ----------
let hasCongratulated = false;

function maybeCongratulate() {
  if (hasCongratulated) return;
  if (isSolved()) {
    hasCongratulated = true;
    startConfetti({ durationMs: 3800, burst: 220 });
  }
}

// ---------- Swap helper (works for tray + board + mobile) ----------
// Returns true if a move/swap happened, false if nothing changed.
function dropTileWithSwap(target, draggedTile, fromId) {
  if (!target || !draggedTile) return false;

  const from = fromId ? document.getElementById(fromId) : draggedTile.parentElement;
  if (!from) return false;

  // If dropping onto the same container, ignore.
  if (from === target) return false;

  const existing = target.querySelector(".tile");

  // empty target => move
  if (!existing) {
    target.appendChild(draggedTile);
    return true;
  }

  // occupied => swap
  target.appendChild(draggedTile);
  from.appendChild(existing);
  return true;
}

// ---------- Tile creation ----------
let nextTileId = 1;

function makeTile(letter) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.textContent = letter;
  tile.draggable = true;
  tile.id = `tile-${nextTileId++}`;

  // Desktop HTML5 drag
  tile.addEventListener("dragstart", (ev) => {
    const from = tile.parentElement; // .slot or .tray-slot
    setDragData(ev, {
      tileId: tile.id,
      fromId: from?.id || null,
    });
  });

  // Mobile pointer drag
  tile.addEventListener("pointerdown", (ev) => startPointerDrag(tile, ev));

  return tile;
}

// ---------- Tray (fixed 8 slots, no shifting) ----------
const TRAY_SIZE = 8;
let initialTrayOrder = [];

function buildTraySlots() {
  trayEl.innerHTML = "";

  for (let i = 0; i < TRAY_SIZE; i++) {
    const s = document.createElement("div");
    s.className = "tray-slot";
    s.dataset.index = String(i);
    s.id = `tray-${i}`;

    s.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    s.addEventListener("drop", (e) => {
      e.preventDefault();
      const data = getDragData(e);
      if (!data || !data.tileId) return;

      const dragged = document.getElementById(data.tileId);
      if (!dragged) return;

      const moved = dropTileWithSwap(s, dragged, data.fromId);
      if (moved) maybeCongratulate();
    });

    trayEl.appendChild(s);
  }
}

function buildTrayForToday() {
  buildTraySlots();

  if (initialTrayOrder.length === 0) {
    initialTrayOrder = [...TILE_LETTERS];

    const seed = (todayIdx * 1315423911) ^ (PUZZLE_ROW * 2654435761);
    const rng = mulberry32(seed >>> 0);
    shuffleWithRng(initialTrayOrder, rng);
  }

  const traySlots = Array.from(trayEl.querySelectorAll(".tray-slot"));
  traySlots.forEach((s) => (s.innerHTML = ""));

  nextTileId = 1;
  initialTrayOrder.forEach((letter, i) => {
    if (!traySlots[i]) return;
    traySlots[i].appendChild(makeTile(letter));
  });
}

// ---------- Board build (5 columns, centered by row group) ----------
function buildBoard() {
  boardEl.innerHTML = "";

  const wordCount = PUZZLE_WORDS.length;

  const square =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--square")) || 64;
  const vGap =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--v-gap")) || 10;

  const step = square + vGap;
  const colHeight = (wordCount - 1) * step + square;

  for (let col = 0; col < 5; col++) {
    const colWrap = document.createElement("div");
    colWrap.className = "col";
    colWrap.dataset.col = String(col);
    colWrap.style.height = `${colHeight}px`;

    const letterRows = new Map();
    for (let w = 0; w < wordCount; w++) {
      const letter = PUZZLE_WORDS[w][col];
      const rowIndex = w + 1;
      if (!letterRows.has(letter)) letterRows.set(letter, []);
      letterRows.get(letter).push(rowIndex);
    }

    const createdSlots = [];
    let slotIdx = 0;

    for (const [letter, rows] of letterRows.entries()) {
      const center = rows.reduce((a, b) => a + b, 0) / rows.length;
      const topPx = (center - 1) * step;

      const slot = document.createElement("div");
      slot.className = "slot empty";
      slot.id = `b-c${col}-s${slotIdx++}`;
      slot.dataset.col = String(col);
      slot.dataset.center = String(center);
      slot.dataset.rows = rows.join(",");
      slot.style.top = `${topPx}px`;

      applyRowColorsToSlot(slot, rows);

      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        slot.classList.add("dragover");
      });

      slot.addEventListener("dragleave", () => {
        slot.classList.remove("dragover");
      });

      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("dragover");

        const data = getDragData(e);
        if (!data || !data.tileId) return;

        const dragged = document.getElementById(data.tileId);
        if (!dragged) return;

        const moved = dropTileWithSwap(slot, dragged, data.fromId);
        if (moved) maybeCongratulate();
      });

      createdSlots.push(slot);
    }

    createdSlots.sort((a, b) => parseFloat(a.dataset.center) - parseFloat(b.dataset.center));
    createdSlots.forEach((s) => colWrap.appendChild(s));
    boardEl.appendChild(colWrap);
  }
}

// ---------- Mobile pointer drag (with swap) ----------
let drag = null;

function startPointerDrag(tile, ev) {
  ev.preventDefault();

  const from = tile.parentElement;
  const fromId = from?.id || null;

  const rect = tile.getBoundingClientRect();

  const ghost = tile.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);

  tile.classList.add("dragging");

  drag = { tile, ghost, fromId };
  movePointerDrag(ev);
}

function movePointerDrag(ev) {
  if (!drag) return;
  drag.ghost.style.left = `${ev.clientX}px`;
  drag.ghost.style.top = `${ev.clientY}px`;
}

function endPointerDrag(ev) {
  if (!drag) return;

  const { tile, ghost, fromId } = drag;
  ghost.remove();
  tile.classList.remove("dragging");

  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const target = el ? el.closest(".slot, .tray-slot") : null;

  if (target) {
    const moved = dropTileWithSwap(target, tile, fromId);
    if (moved) maybeCongratulate();
  }

  drag = null;
}

document.addEventListener("pointermove", movePointerDrag, { passive: false });
document.addEventListener("pointerup", endPointerDrag, { passive: false });
document.addEventListener("pointercancel", endPointerDrag, { passive: false });

// ---------- Buttons ----------
resetBtn.addEventListener("click", () => {
  hasCongratulated = false; // allow alert again after reset
  stopConfetti();
  buildBoard();
  initialTrayOrder = []; // rebuild exact same order for today (seeded)
  buildTrayForToday();
});

// Leave the button on the page but make it do nothing for now
checkBtn.addEventListener("click", () => {
  // intentionally no-op
});

// ---------- Init ----------
buildBoard();
buildTrayForToday();
