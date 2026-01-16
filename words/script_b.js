function dayIndexLocal() {
  const now = new Date();
  // Normalize to local midnight so time-of-day doesn't change the index
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(midnight.getTime() / 86400000); // days since Jan 1, 1970
}

const PUZZLE_ROW = dayIndexLocal() % PUZZLES.length;

// Shared positions (2nd and 4th letters): indices 1 and 3
const SHARED_INDICES = new Set([1, 3]);

// Grab the selected puzzle
const SOLUTION_WORDS = PUZZLES[PUZZLE_ROW].map(w => w.toUpperCase());

// Build tile pool: all letters from word1 + non-shared letters from word2
const letters = (() => {
  const [w1, w2] = SOLUTION_WORDS;
  const result = [];
  result.push(...w1.split(""));
  w2.split("").forEach((ch, i) => {
    if (!SHARED_INDICES.has(i)) result.push(ch);
  });
  return result;
})();

const TRAY_SIZE = 8; // 2 rows x 4 cols

const tray = document.getElementById("tray");
const boardSlots = document.querySelectorAll(".slot");

// Stores the initial (seeded) tray order so Reset restores it exactly
let initialTrayOrder = [];

// ===== Drag data helpers =====
function setDragData(ev, obj) {
  ev.dataTransfer.setData("application/json", JSON.stringify(obj));
}

function getDragData(ev) {
  const raw = ev.dataTransfer.getData("application/json");
  return raw ? JSON.parse(raw) : null;
}

// ===== Shuffle (use your seeded RNG if you already have one) =====
// If you have a seeded RNG, replace Math.random() usage inside shuffle().
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ===== Board helpers =====
function clearSlot(slot) {
  slot.innerHTML = "";
  slot.classList.add("empty");
  slot.classList.remove("filled");
}

function placeTile(slot, letter) {
  const tile = makeTile(letter);
  slot.innerHTML = "";
  slot.appendChild(tile);
  slot.classList.remove("empty");
  slot.classList.add("filled");
}

// ===== Tile creation =====
function makeTile(letter) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.textContent = letter;
  tile.draggable = true;

  tile.addEventListener("dragstart", (ev) => {
    setDragData(ev, {
      letter,
      sourceType: tile.closest(".tray-slot") ? "tray" : "slot",
      sourceId: tile.closest(".hex.slot")?.id || null,
      trayIndex: tile.dataset.trayIndex ?? null
    });
  });

  return tile;
}

// ===== Tray (fixed slots so nothing shifts) =====
function buildTraySlots() {
  tray.innerHTML = "";

  for (let i = 0; i < TRAY_SIZE; i++) {
    const slot = document.createElement("div");
    slot.className = "tray-slot";
    slot.dataset.index = String(i);

    slot.addEventListener("dragover", (e) => {
      if (!slot.querySelector(".tile")) e.preventDefault();
    });

    // slot.addEventListener("drop", (e) => {
    //   e.preventDefault();
    //   const data = getDragData(e);
    //   if (!data || !data.letter) return;

    //   // Only drop into empty tray slot
    //   if (slot.querySelector(".tile")) return;

    //   // If dragging from a board slot, clear that board slot
    //   if (data.sourceType === "slot" && data.sourceId) {
    //     const fromSlot = document.getElementById(data.sourceId);
    //     if (fromSlot) clearSlot(fromSlot);
    //   }

    //   // Put tile into this exact tray slot
    //   const tile = makeTile(data.letter);
    //   tile.dataset.trayIndex = slot.dataset.index;
    //   slot.appendChild(tile);
    // });
    slot.addEventListener("drop", (e) => {
        e.preventDefault();
        const data = getDragData(e);
        if (!data || !data.letter) return;

        // only drop into empty tray slot
        if (slot.querySelector(".tile")) return;

        // If dragging from a BOARD slot, clear that board slot and create a new tile here
        if (data.sourceType === "slot" && data.sourceId) {
            const fromSlot = document.getElementById(data.sourceId);
            if (fromSlot) clearSlot(fromSlot);

            const newTile = makeTile(data.letter);
            newTile.dataset.trayIndex = slot.dataset.index;
            slot.appendChild(newTile);
            return;
        }

        // If dragging from another TRAY slot, MOVE the existing tile (no duplicates)
        if (data.sourceType === "tray" && data.trayIndex !== null) {
            // If dropped back into the same slot, do nothing
            if (String(data.trayIndex) === String(slot.dataset.index)) return;

            const fromTraySlot = tray.querySelector(`.tray-slot[data-index="${data.trayIndex}"]`);
            if (!fromTraySlot) return;

            const existingTile = fromTraySlot.querySelector(".tile");
            if (!existingTile) return;

            // Move the tile DOM node
            existingTile.dataset.trayIndex = slot.dataset.index;
            slot.appendChild(existingTile);
            return;
        }
        });


    tray.appendChild(slot);
  }
}

function buildTray() {
  buildTraySlots();

  // Create initial tray order once (seeded shuffle should happen here)
  if (initialTrayOrder.length === 0) {
    initialTrayOrder = [...letters];
    shuffle(initialTrayOrder);
  }

  const traySlots = Array.from(tray.querySelectorAll(".tray-slot"));
  traySlots.forEach(s => (s.innerHTML = ""));

  initialTrayOrder.forEach((letter, i) => {
    const tile = makeTile(letter);
    tile.dataset.trayIndex = String(i);
    traySlots[i].appendChild(tile);
  });
}

// ===== Board drop logic =====
boardSlots.forEach(slot => {
  slot.addEventListener("dragover", (e) => {
    if (slot.classList.contains("empty")) {
      e.preventDefault();
      slot.classList.add("dragover");
    }
  });

  slot.addEventListener("dragleave", () => {
    slot.classList.remove("dragover");
  });

  slot.addEventListener("drop", (ev) => {
    ev.preventDefault();
    slot.classList.remove("dragover");

    if (!slot.classList.contains("empty")) return;

    const data = getDragData(ev);
    if (!data || !data.letter) return;

    // If coming from another board slot, clear that slot first
    if (data.sourceType === "slot" && data.sourceId) {
      const fromSlot = document.getElementById(data.sourceId);
      if (fromSlot) clearSlot(fromSlot);
    }

    // If coming from tray, remove tile from its specific tray slot (leave slot)
    if (data.sourceType === "tray" && data.trayIndex !== null) {
      const traySlot = tray.querySelector(`.tray-slot[data-index="${data.trayIndex}"]`);
      if (traySlot) {
        const tile = traySlot.querySelector(".tile");
        if (tile) tile.remove();
      }
    }

    // Place tile into this board slot
    placeTile(slot, data.letter);
  });
});

// ===== Solution checking =====
function getBoardWords() {
  const topIds = ["slot-LT", "slot-M1", "slot-CT", "slot-M2", "slot-RT"];
  const botIds = ["slot-LB", "slot-M1", "slot-CB", "slot-M2", "slot-RB"];

  function read(ids) {
    return ids.map(id => {
      const s = document.getElementById(id);
      const t = s.querySelector(".tile");
      return t ? t.textContent : null;
    });
  }

  const top = read(topIds);
  const bot = read(botIds);

  if (top.includes(null) || bot.includes(null)) return null;

  return [top.join(""), bot.join("")];
}

function isCorrectSolution(words) {
  if (!words || words.length !== 2) return false;
  const attempt = [...words].sort().join("|");
  const solution = [...SOLUTION_WORDS].sort().join("|");
  return attempt === solution;
}

// ===== Buttons =====
document.getElementById("resetBtn").addEventListener("click", () => {
  boardSlots.forEach(clearSlot);
  buildTray(); // restores ORIGINAL initialTrayOrder
});

document.getElementById("checkBtn").addEventListener("click", () => {
  const words = getBoardWords();
  if (!words) {
    alert("The board is not complete yet.");
    return;
  }
  alert(isCorrectSolution(words) ? "✅ Correct! You found the solution." : "❌ Not quite. Try again!");
});

// ===== Init =====
buildTray();
