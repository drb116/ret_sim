// script.js

// ---------- Daily puzzle selection ----------
function localMidnightDays(d = new Date()) {
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(mid.getTime() / 86400000);
}

// Make "today" (the day you deploy) map to row 0.
// Edit this date if you want a different start.
const START_ROW_ZERO_ON = new Date(2026, 0, 15); // Jan 15, 2026 (month is 0-based)

const todayIdx = localMidnightDays(new Date());
const baseIdx = localMidnightDays(START_ROW_ZERO_ON);
const PUZZLE_ROW = ((todayIdx - baseIdx) % PUZZLES.length + PUZZLES.length) % PUZZLES.length;

const PUZZLE_WORDS = PUZZLES[PUZZLE_ROW].map(w => w.toUpperCase());

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
  if (!Array.isArray(words) || words.length < 2 || words.length > 4) return { ok: false, msg: "Puzzle must have 2–4 words." };
  if (words.some(w => typeof w !== "string" || w.length !== 5)) return { ok: false, msg: "All words must be 5 letters." };

  const uniq = uniqueLetters(words);
  if (uniq.size !== 8) return { ok: false, msg: `Puzzle must have exactly 8 unique letters (has ${uniq.size}).` };

  const cols = lettersByPosition(words);
  if (cols.some(set => set.size < 1 || set.size > 4)) return { ok: false, msg: "Each position must have 1–4 possible letters." };

  return { ok: true, cols, uniq };
}

const puzzleCheck = validatePuzzle(PUZZLE_WORDS);
if (!puzzleCheck.ok) {
  // Fail loudly in the console; keep UI from exploding
  console.error("Invalid puzzle:", PUZZLE_WORDS, puzzleCheck.msg);
}

const EXPECTED_COLS = puzzleCheck.ok ? puzzleCheck.cols : lettersByPosition(["ABCDE","FGHIJ"]);
const TILE_LETTERS = puzzleCheck.ok ? Array.from(puzzleCheck.uniq) : ["A","B","C","D","E","F","G","H"];

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

document.addEventListener("pointermove", movePointerDrag, { passive: false });
document.addEventListener("pointerup", endPointerDrag, { passive: false });
document.addEventListener("pointercancel", endPointerDrag, { passive: false });


// Show selected words (you can hide this later)
// puzzleWordsEl.textContent = PUZZLE_WORDS.join(" / ");

function rowColorVar(rowIndex1Based) {
  return `var(--row${rowIndex1Based})`;
}

function applyRowColorsToSlot(slot, rows) {
  // rows is an array like [1] or [1,2] or [1,2,3]
  slot.dataset.n = String(rows.length);

  // Set CSS custom properties used by the gradients
  slot.style.setProperty("--c1", rowColorVar(rows[0]));
  if (rows[1]) slot.style.setProperty("--c2", rowColorVar(rows[1]));
  if (rows[2]) slot.style.setProperty("--c3", rowColorVar(rows[2]));
  if (rows[3]) slot.style.setProperty("--c4", rowColorVar(rows[3]));
}

// ---------- Drag data helpers ----------
function setDragData(ev, obj) {
  ev.dataTransfer.setData("application/json", JSON.stringify(obj));
}

function getDragData(ev) {
  const raw = ev.dataTransfer.getData("application/json");
  return raw ? JSON.parse(raw) : null;
}

// ---------- Tile creation ----------
let nextTileId = 1;

function makeTile(letter) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.textContent = letter;
  tile.draggable = true;
  tile.id = `tile-${nextTileId++}`;

  tile.addEventListener("pointerdown", (ev) => startPointerDrag(tile, ev));

  tile.addEventListener("dragstart", (ev) => {
    const fromTraySlot = tile.closest(".tray-slot");
    const fromBoardSlot = tile.closest(".slot");

    setDragData(ev, {
      tileId: tile.id,
      letter,
      sourceType: fromTraySlot ? "tray" : "board",
      sourceTrayIndex: fromTraySlot ? fromTraySlot.dataset.index : null,
      sourceBoardKey: fromBoardSlot ? fromBoardSlot.dataset.key : null
    });
  });

  return tile;
}

// ---------- Build tray (fixed 8 slots, no shifting) ----------
const TRAY_SIZE = 8;
let initialTrayOrder = []; // letters in fixed tray order for today

function buildTraySlots() {
  trayEl.innerHTML = "";
  for (let i = 0; i < TRAY_SIZE; i++) {
    const s = document.createElement("div");
    s.className = "tray-slot";
    s.dataset.index = String(i);

    s.addEventListener("dragover", (e) => {
      if (!s.querySelector(".tile")) e.preventDefault();
    });

    s.addEventListener("drop", (e) => {
      e.preventDefault();
      const data = getDragData(e);
      if (!data || !data.tileId) return;

      if (s.querySelector(".tile")) return; // must be empty

      const tile = document.getElementById(data.tileId);
      if (!tile) return;

      // If moving within tray, just move the existing node
      // If coming from board, we also just move the existing node
      s.appendChild(tile);
    });

    trayEl.appendChild(s);
  }
}

function buildTrayForToday() {
  buildTraySlots();

  // Create deterministic order once per page load (per day/puzzle)
  if (initialTrayOrder.length === 0) {
    initialTrayOrder = [...TILE_LETTERS];

    // seed: day + puzzle row
    const seed = (todayIdx * 1315423911) ^ (PUZZLE_ROW * 2654435761);
    const rng = mulberry32(seed >>> 0);

    shuffleWithRng(initialTrayOrder, rng);
  }

  const traySlots = Array.from(trayEl.querySelectorAll(".tray-slot"));
  traySlots.forEach(s => (s.innerHTML = ""));

  // Create new tiles fresh on build
  nextTileId = 1;
  initialTrayOrder.forEach((letter, i) => {
    const tile = makeTile(letter);
    traySlots[i].appendChild(tile);
  });
}

// ---------- Build board (5 columns with variable heights) ----------
function clearBoard() {
  boardEl.querySelectorAll(".slot").forEach(slot => {
    slot.innerHTML = "";
    slot.classList.add("empty");
    slot.classList.remove("filled");
  });
}

function buildBoard() {
  boardEl.innerHTML = "";

  const wordCount = PUZZLE_WORDS.length;

  // Must match CSS: slot size + vertical gap
  const square = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--square")) || 64;
  const vGap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--v-gap")) || 10;
  const step = square + vGap;

  // Height so rows have room for top/bottom extremes (rowCount rows)
  const colHeight = (wordCount - 1) * step + square;

  // Precompute: for each column, group words by letter and compute "center row"
  // Row index is 1..wordCount, based on the order of PUZZLE_WORDS in puzzles.js
  for (let col = 0; col < 5; col++) {
    const colWrap = document.createElement("div");
    colWrap.className = "col";
    colWrap.dataset.col = String(col);
    colWrap.style.height = `${colHeight}px`;

    // Map letter -> array of row indices where it appears
    const letterRows = new Map();

    for (let w = 0; w < wordCount; w++) {
      const letter = PUZZLE_WORDS[w][col];
      const rowIndex = w + 1; // 1-based
      if (!letterRows.has(letter)) letterRows.set(letter, []);
      letterRows.get(letter).push(rowIndex);
    }

    // Create slots for each distinct letter option, positioned by averaged row
    const slots = [];
    for (const [letter, rows] of letterRows.entries()) {
      const center = rows.reduce((a, b) => a + b, 0) / rows.length; // can be fractional like 2.5
      const topPx = (center - 1) * step;

      const slot = document.createElement("div");
      slot.className = "slot empty";
      slot.dataset.col = String(col);
      slot.dataset.center = String(center);
      slot.dataset.rows = rows.join(",");
      applyRowColorsToSlot(slot, rows); 
      slot.style.top = `${topPx}px`;

      // Drag/drop handlers
      slot.addEventListener("dragover", (e) => {
        if (slot.querySelector(".tile")) return;
        e.preventDefault();
        slot.classList.add("dragover");
      });

      slot.addEventListener("dragleave", () => {
        slot.classList.remove("dragover");
      });

      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("dragover");

        if (slot.querySelector(".tile")) return;

        const data = getDragData(e);
        if (!data || !data.tileId) return;

        const tile = document.getElementById(data.tileId);
        if (!tile) return;

        slot.appendChild(tile);
      });

      slots.push(slot);
    }

    // Sort top-to-bottom by center position (so DOM order matches visuals)
    slots.sort((a, b) => parseFloat(a.dataset.center) - parseFloat(b.dataset.center));
    slots.forEach(s => colWrap.appendChild(s));

    boardEl.appendChild(colWrap);
  }
}

// ---------- Check solution ----------
function slotLettersInCol(colIndex) {
  const colEl = boardEl.querySelector(`.col[data-col="${colIndex}"]`);
  if (!colEl) return [];
  const letters = [];
  colEl.querySelectorAll(".slot").forEach(slot => {
    const tile = slot.querySelector(".tile");
    if (tile) letters.push(tile.textContent);
  });
  return letters;
}

function slotsInColumn(colIndex) {
  const colEl = boardEl.querySelector(`.col[data-col="${colIndex}"]`);
  return colEl ? Array.from(colEl.querySelectorAll(".slot")) : [];
}

function slotAppliesToRow(slot, rowIndex1Based) {
  const rows = (slot.dataset.rows || "").split(",").map(x => parseInt(x, 10));
  return rows.includes(rowIndex1Based);
}

function buildWordsFromBoard() {
  const wordCount = PUZZLE_WORDS.length;
  const built = [];

  // Must have a tile in every board slot
  for (let col = 0; col < 5; col++) {
    for (const s of slotsInColumn(col)) {
      if (!s.querySelector(".tile")) return null;
    }
  }

  // Build each word row-by-row by selecting the slot that applies to that row
  for (let r = 1; r <= wordCount; r++) {
    let word = "";

    for (let col = 0; col < 5; col++) {
      const colSlots = slotsInColumn(col);

      // find the single slot in this column that applies to row r
      const targetSlot = colSlots.find(s => slotAppliesToRow(s, r));
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

  // Compare as sets (order doesn't matter)
  const attempt = [...built].sort().join("|");
  const solution = [...PUZZLE_WORDS].sort().join("|");
  return attempt === solution;
}

// ---------- Dragging ---------
let drag = null;

function isValidDropTarget(el) {
  if (!el) return null;
  const target = el.closest(".slot, .tray-slot");
  if (!target) return null;
  if (target.querySelector(".tile")) return null; // must be empty
  return target;
}

function startPointerDrag(tile, ev) {
  ev.preventDefault();

  const rect = tile.getBoundingClientRect();

  const ghost = tile.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);

  tile.classList.add("dragging");

  drag = { tile, ghost };

  movePointerDrag(ev);
}

function movePointerDrag(ev) {
  if (!drag) return;
  drag.ghost.style.left = `${ev.clientX}px`;
  drag.ghost.style.top = `${ev.clientY}px`;
}

function endPointerDrag(ev) {
  if (!drag) return;

  const { tile, ghost } = drag;
  ghost.remove();
  tile.classList.remove("dragging");

  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const target = isValidDropTarget(el);

  if (target) {
    target.appendChild(tile);   // move real tile
  }

  drag = null;
}

// ---------- Buttons ----------
resetBtn.addEventListener("click", () => {
  buildBoard();
  initialTrayOrder = []; // rebuild exact same order for today (seeded)
  buildTrayForToday();
});

checkBtn.addEventListener("click", () => {
  const built = buildWordsFromBoard();

  if (!built) {
    alert("The board is not complete yet.");
    return;
  }

  if (isSolved()) {
    alert(`✅ Correct!\n\n${built.join(" / ")}`);
  } else {
    alert(`❌ Not quite.\n\nYou currently have:\n${built.join(" / ")}`);
  }
});


// ---------- Init ----------
buildBoard();
buildTrayForToday();
