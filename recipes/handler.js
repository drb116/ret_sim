const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STORAGE_KEY = "weeklyMenu.v2";
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

/* ===== Local-time date helpers ===== */
function dateFromKeyLocal(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function keyFromDateLocal(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; }
function atMidnightLocal(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfWeekSundayLocal(d) { const x = atMidnightLocal(d); const diff = x.getDay(); x.setDate(x.getDate() - diff); return x; }
function fmtMDY(d) { return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`; }

/* ===== Storage (multi-week) ===== */
function emptyWeek() { return Object.fromEntries(DAYS.map(d => [d, []])); }
function loadAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const obj = JSON.parse(raw);
            if (!obj.weeks) obj.weeks = {};
            if (!obj.current) obj.current = keyFromDateLocal(startOfWeekSundayLocal(new Date()));
            return obj;
        }
    } catch { }
    return { current: keyFromDateLocal(startOfWeekSundayLocal(new Date())), weeks: {} };
}
function getWeekState(all, key) { return all.weeks[key] ? structuredClone(all.weeks[key]) : emptyWeek(); }
function saveWeek(all, key, state) { all.weeks[key] = state; localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); }

/* ===== DOM & scaffold ===== */
const weekGrid = $("#week-grid");
const weekTitle = $("#week-title");

DAYS.forEach(day => {
    const wrap = document.createElement("div");
    wrap.className = "day"; wrap.dataset.day = day;
    wrap.innerHTML = `
    <div class="day-head">
      <span>${day}</span>
      <div class="day-actions">
        <button class="btn btn-ghost" data-day-note="${day}" title="Add note to ${day}">+</button>
        <button class="btn btn-ghost" data-day-clear="${day}" title="Clear ${day}">Clear</button>
      </div>
    </div>
    <div class="day-list" aria-label="${day} menu"></div>`;
    addDropHandlers(wrap);
    weekGrid.appendChild(wrap);
});

/* ===== State ===== */
let ALL = loadAll();
let CURRENT_KEY = ALL.current;
renderWeek();

/* ===== Nav (Prev / This Week / Next) ===== */
$("#btn-prev-week").addEventListener("click", () => shiftWeek(-7));
$("#btn-next-week").addEventListener("click", () => shiftWeek(+7));
$("#btn-this-week").addEventListener("click", goToThisWeek);

function shiftWeek(deltaDays) {
    persist();
    const curr = dateFromKeyLocal(CURRENT_KEY);
    curr.setDate(curr.getDate() + deltaDays);
    const newStart = startOfWeekSundayLocal(curr);
    CURRENT_KEY = keyFromDateLocal(newStart);
    ALL.current = CURRENT_KEY;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ALL));
    renderWeek();
}
function goToThisWeek() {
    persist(); // keep edits
    const todayStart = startOfWeekSundayLocal(new Date());
    CURRENT_KEY = keyFromDateLocal(todayStart);
    ALL.current = CURRENT_KEY;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ALL));
    renderWeek();
}
function setTitleForWeek(key) { weekTitle.textContent = `Weekly Menu for week of ${fmtMDY(dateFromKeyLocal(key))}`; }

/* ===== Render ===== */
function renderWeek() {
    $$(".day-list").forEach(list => list.innerHTML = "");
    const weekState = getWeekState(ALL, CURRENT_KEY);
    DAYS.forEach(day => {
        const list = weekGrid.querySelector(`.day[data-day="${day}"] .day-list`);
        (weekState[day] || []).forEach(entry => {
            if (entry.type === "note") { addNoteChip(list, entry.text); }
            else if (entry.type === "manual") { addRecipeChip(list, { title: entry.title, href: "" }); }
            else { addRecipeChip(list, { title: entry.title, href: entry.href }); }
        });
    });
    setTitleForWeek(CURRENT_KEY);
}

/* ===== Day actions ===== */
weekGrid.addEventListener("click", (e) => {
    const clearBtn = e.target.closest("[data-day-clear]");
    const noteBtn = e.target.closest("[data-day-note]");
    if (clearBtn) {
        const day = clearBtn.dataset.dayClear;
        const box = weekGrid.querySelector(`.day[data-day="${day}"] .day-list`);
        box.innerHTML = ""; persist(); return;
    }
    if (noteBtn) {
        const day = noteBtn.dataset.dayNote;
        const box = weekGrid.querySelector(`.day[data-day="${day}"] .day-list`);
        const text = prompt(`Add a note for ${day}:`, "Eat Out");
        if (text && text.trim()) { addNoteChip(box, text.trim()); persist(); }
    }
});

/* ===== Toolbar ===== */
$("#btn-clear").addEventListener("click", () => {
    if (!confirm("Clear the entire weekly menu?")) return;
    $$(".day-list").forEach(d => d.innerHTML = ""); persist();
});
$("#btn-save").addEventListener("click", persist);
$("#btn-shopping").addEventListener("click", buildShoppingList);

/* ===== Modal ===== */
const modal = $("#shopping-modal");
$("#btn-close").addEventListener("click", () => modal.classList.remove("open"));
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });
$("#btn-copy").addEventListener("click", copyShoppingList);

/* ===== Library draggables ===== */
enhanceRecipeLinks();
function enhanceRecipeLinks() {
    const anchors = $$('a[href$=".html"]');
    anchors.forEach(a => {
        if (!/\/recipes\/|\.\/.*\.html/i.test(a.getAttribute("href"))) return;
        a.classList.add("recipe-draggable");
        a.setAttribute("draggable", "true");
        a.addEventListener("dragstart", (ev) => {
            const href = new URL(a.getAttribute("href"), location.href).toString();
            const title = (a.textContent || a.getAttribute("title") || "Recipe").trim();
            ev.dataTransfer.setData("application/json", JSON.stringify({ title, href, kind: "link" }));
            ev.dataTransfer.effectAllowed = "copy";
        });
    });
    const cards = $$('.no-recipe');
    cards.forEach(card => {
        card.setAttribute("draggable", "true");
        card.addEventListener("dragstart", (ev) => {
            const title = (card.textContent || "Item").trim();
            ev.dataTransfer.setData("application/json", JSON.stringify({ title, href: "", kind: "manual" }));
            ev.dataTransfer.effectAllowed = "copy";
        });
    });
}

/* ===== Drop handlers ===== */
function addDropHandlers(dayElem) {
    dayElem.addEventListener("dragover", (ev) => {
        const types = ev.dataTransfer.types;
        if (!types || (!types.includes("application/json") && !types.includes("text/plain"))) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = (ev.dataTransfer.effectAllowed === "move") ? "move" : "copy";
        dayElem.classList.add("dragover");
    });
    dayElem.addEventListener("dragleave", () => dayElem.classList.remove("dragover"));
    dayElem.addEventListener("drop", (ev) => {
        dayElem.classList.remove("dragover");
        ev.preventDefault();
        const raw = ev.dataTransfer.getData("application/json"); if (!raw) return;
        let data; try { data = JSON.parse(raw); } catch { return; }
        const list = dayElem.querySelector(".day-list");
        const targetDay = dayElem.dataset.day;

        if (data.kind === "chip") {
            addRecipeChip(list, { title: data.title, href: data.href || "" });
            if (data.fromDay && data.fromDay !== targetDay) { removeChipFromDay(data, data.fromDay); }
            persist();
            return;
        }
        addRecipeChip(list, { title: data.title, href: data.href || "" });
        persist();
    });
}

/* ===== Chips ===== */
function addRecipeChip(listEl, { title, href }) {
    const safeTitle = escapeHtml(title || "Item");
    const hasHref = !!href;

    if (hasHref) {
        if (listEl.querySelector(`.chip[data-type="recipe"][data-href="${href}"]`)) return;
    } else {
        const existsByTitle = Array.from(listEl.querySelectorAll('.chip[data-type="manual"] .chip-title'))
            .some(el => el.textContent.trim().toLowerCase() === safeTitle.toLowerCase());
        if (existsByTitle) return;
    }

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.dataset.type = hasHref ? "recipe" : "manual";
    if (hasHref) chip.dataset.href = href;

    chip.innerHTML = hasHref
        ? `<a href="${href}" target="_blank" rel="noopener" draggable="false">${safeTitle}</a>
       <span class="x" title="Remove" aria-label="Remove">×</span>`
        : `<span class="chip-title">${safeTitle}</span>
       <span class="x" title="Remove" aria-label="Remove">×</span>`;

    chip.querySelector(".x").addEventListener("click", () => { chip.remove(); persist(); });
    listEl.appendChild(chip);
    makeChipDraggable(chip);
    enhanceRecipeLinks();
}
function makeChipDraggable(chip) {
    chip.setAttribute("draggable", "true");
    chip.addEventListener("dragstart", (ev) => {
        const type = chip.dataset.type || "recipe";
        const href = chip.dataset.href || "";
        const title = type === "recipe" ? ($("a", chip)?.textContent || "").trim()
            : ($(".chip-title", chip)?.textContent || "").trim();
        const fromDay = chip.closest(".day")?.dataset.day || "";
        const payload = { kind: "chip", type, href, title, fromDay };
        ev.dataTransfer.setData("application/json", JSON.stringify(payload));
        ev.dataTransfer.setData("text/plain", title);
        ev.dataTransfer.effectAllowed = "move";
    });
}
function addNoteChip(listEl, text) {
    const chip = document.createElement("div");
    chip.className = "chip chip-note";
    chip.dataset.type = "note";
    chip.innerHTML = `
    <span class="note-text">${escapeHtml(text)}</span>
    <span class="x" title="Remove" aria-label="Remove">×</span>`;
    chip.addEventListener("dblclick", () => {
        const current = $(".note-text", chip).textContent;
        const next = prompt("Edit note:", current);
        if (next === null) return;
        const trimmed = next.trim();
        if (trimmed) { $(".note-text", chip).textContent = trimmed; persist(); }
        else { chip.remove(); persist(); }
    });
    chip.querySelector(".x").addEventListener("click", () => { chip.remove(); persist(); });
    listEl.appendChild(chip);
    makeChipDraggable(chip);
}
function removeChipFromDay(data, fromDay) {
    const dayEl = weekGrid.querySelector(`.day[data-day="${fromDay}"]`);
    if (!dayEl) return;
    if (data.type === "recipe" && data.href) {
        const chips = $$('.day-list .chip[data-type="recipe"]', dayEl);
        const match = chips.find(ch => (ch.dataset.href || "") === data.href);
        if (match) match.remove(); return;
    }
    if (data.type === "manual") {
        const chips = $$('.day-list .chip[data-type="manual"] .chip-title', dayEl);
        const match = chips.find(el => (el.textContent || "").trim().toLowerCase() === (data.title || "").trim().toLowerCase());
        if (match) match.closest(".chip")?.remove(); return;
    }
    if (data.type === "note") {
        const chips = $$('.day-list .chip[data-type="note"] .note-text', dayEl);
        const match = chips.find(el => (el.textContent || "").trim() === (data.title || "").trim());
        if (match) match.closest(".chip")?.remove();
    }
}

/* ===== Persistence ===== */
function collectCurrentUI() {
    const data = emptyWeek();
    $$(".day").forEach(day => {
        const name = day.dataset.day; const arr = [];
        $$(".day-list .chip", day).forEach(chip => {
            const type = chip.dataset.type || "recipe";
            if (type === "note") {
                const t = $(".note-text", chip)?.textContent?.trim();
                if (t) arr.push({ type: "note", text: t });
            } else if (type === "manual") {
                const t = $(".chip-title", chip)?.textContent?.trim();
                if (t) arr.push({ type: "manual", title: t });
            } else {
                const a = $("a", chip);
                if (a) {
                    arr.push({ type: "recipe", title: a.textContent.trim(), href: new URL(a.getAttribute("href"), location.href).toString() });
                }
            }
        });
        data[name] = arr;
    });
    return data;
}
function persist() { const weekState = collectCurrentUI(); saveWeek(ALL, CURRENT_KEY, weekState); flashToolbar(); }

/* ===== Shopping list and misc ===== */
function flashToolbar() { const btn = $("#btn-save"); if (!btn) return; const orig = btn.textContent; btn.textContent = "Saved"; setTimeout(() => btn.textContent = orig, 800); }
const PANTRY = ["salt", "oregano", "garlic", "basil", "parsley", "vegetable oil", "olive oil", "cornstarch", "white sugar", "taco seasoning", "chicken broth", "boiling water", "black pepper", "chili powder", "cumin", "garam masala", "onion powder", "turmeric"];
function isPantryItem(text) { const t = (text || "").toLowerCase(); return PANTRY.some(p => t.includes(p.toLowerCase())); }
function normalizeIngredient(s) { if (!s) return ""; return String(s).replace(/\u00BD/g, "1/2").replace(/\u00BC/g, "1/4").replace(/\u00BE/g, "3/4").replace(/\u2150/g, "1/7").replace(/\u2153/g, "1/3").replace(/\u2154/g, "2/3").replace(/\u00A0/g, " ").replace(/[–—−]/g, "-").replace(/^[*•\-\u2022]\s*/, "").replace(/\s+/g, " ").trim(); }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function buildShoppingList() {
    const selections = collectAllMenuRecipes();
    if (selections.length === 0) { alert("No recipes in the weekly menu yet."); return; }
    const byPath = new Map();
    for (const { title, href } of selections) {
        const u = new URL(href, location.href);
        const path = u.pathname + (u.search || "");
        if (!byPath.has(path)) byPath.set(path, { title, href, path });
    }
    const results = []; const warnings = []; const errors = [];
    for (const item of byPath.values()) {
        try {
            const html = await fetch(item.path, { credentials: "same-origin", redirect: "follow" })
                .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`); return r.text(); });
            const ings = extractIngredientsFromHtml(html);
            if (!ings || ings.length === 0) warnings.push(`No ingredients found: ${item.title}`);
            else results.push(...ings);
        } catch (err) { errors.push(`Fetch failed: ${item.title} → ${item.path} (${err?.message || "unknown error"})`); }
    }
    const normalized = results.map(t => normalizeIngredient(t)).filter(Boolean);
    const omitted = normalized.filter(isPantryItem);
    const kept = normalized.filter(x => !isPantryItem(x));
    const uniq = Array.from(new Set(kept));
    const list = document.getElementById("shopping-list"); list.innerHTML = "";
    uniq.forEach(item => { const li = document.createElement("li"); li.textContent = item; list.appendChild(li); });
    const parts = [`Collected ${uniq.length} unique ingredients`, `from ${byPath.size} recipe(s)`];
    if (omitted.length) parts.push(`(excluded ${omitted.length} pantry item(s))`);
    document.getElementById("shopping-summary").textContent = parts.join(" ");
    const warnBox = $("#shopping-warnings"); warnBox.innerHTML = "";
    if (warnings.length) {
        const div = document.createElement("div");
        div.innerHTML = `<p class="warn">Warnings:</p><ul>${warnings.map(w => `<li class="warn">${escapeHtml(w)}</li>`).join("")}</ul>`;
        warnBox.appendChild(div);
    }
    const errBox = $("#shopping-errors"); errBox.innerHTML = "";
    if (errors.length) { errBox.innerHTML = `<p class="warn">Errors:</p><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`; }
    $("#shopping-modal").classList.add("open");
}
function collectAllMenuRecipes() {
    const items = [];
    $$(".day-list").forEach(list => {
        $$('.chip[data-type="recipe"]', list).forEach(chip => {
            const a = $("a", chip); if (!a) return;
            items.push({ title: a.textContent.trim(), href: new URL(a.getAttribute("href"), location.href).toString() });
        });
    });
    return items;
}
function extractIngredientsFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const heading = $$("h1,h2,h3,h4", doc).find(h => h.textContent.trim().toLowerCase() === "ingredients");
    if (heading) {
        const out = []; let el = heading.nextElementSibling;
        while (el) {
            if (/^H[1-6]$/i.test(el.tagName)) break;
            if (el.tagName === "UL") { $$("li", el).forEach(li => out.push(li.textContent.trim())); }
            el = el.nextElementSibling;
        }
        if (out.length) return out;
    }
    const allUL = $$("ul", doc);
    if (allUL.length) {
        for (const ul of allUL) {
            const items = $$("li", ul).map(li => li.textContent.trim()).filter(Boolean);
            if (items.length >= 3) { return items; }
        }
    }
    const anyLi = $$("li", doc).slice(0, 50).map(li => li.textContent.trim()).filter(Boolean);
    return anyLi.length ? anyLi : [];
}
async function copyShoppingList() {
    const items = $$("#shopping-list li").map(li => li.textContent);
    try { await navigator.clipboard.writeText(items.join("\n")); alert("Shopping list copied."); }
    catch { alert("Copy failed; your browser may block clipboard access."); }
}

/* drag auto-scroll */
let autoScrollInterval = null;
document.addEventListener("dragover", (e) => {
    const EDGE = 60, SPEED = 20;
    const y = e.clientY, h = window.innerHeight;
    clearInterval(autoScrollInterval);
    if (y < EDGE) { autoScrollInterval = setInterval(() => window.scrollBy({ top: -SPEED, behavior: "auto" }), 16); }
    else if (y > h - EDGE) { autoScrollInterval = setInterval(() => window.scrollBy({ top: SPEED, behavior: "auto" }), 16); }
});
document.addEventListener("dragleave", () => { clearInterval(autoScrollInterval); });
document.addEventListener("drop", () => { clearInterval(autoScrollInterval); });
