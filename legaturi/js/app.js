// Page logic for Legături: the board, animations, saving and the dialogs.
(function () {
  "use strict";

  const L = window.Legaturi;
  const PUZZLES = (window.LEGATURI_PUZZLES || []).slice().sort((a, b) => a.id - b.id);
  const KEY = "legaturi.v1";
  const SITE = /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname)
    ? location.host + location.pathname.replace(/index\.html$/, "") : "";
  const RESULT_TITLES = ["Perfect!", "Excelent!", "Foarte bine!", "La limită!"];
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const board = $("board");

  // ---------- saving ----------
  // { games: { [puzzle number]: game }, theme: "light" | "dark", seenHelp: true }
  const store = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === "object" && s.games && typeof s.games === "object") return s;
    } catch (e) {}
    return { games: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

  const today = () => L.numberForDate(new Date());
  const puzzleById = (n) => PUZZLES.find((p) => p.id === n);
  const dateText = (n, opts) => new Intl.DateTimeFormat("ro-RO", opts).format(L.dateForNumber(n));

  let puzzle = null;  // the puzzle on screen
  let game = null;    // its progress
  let selected = [];  // selected words, in click order
  let busy = false;   // true while an animation runs

  function persist() { store.games[puzzle.id] = game; save(); }

  // ---------- opening a puzzle ----------
  // Plays puzzle n, or today's when n is missing. Older puzzles open from the archive as #n.
  function open(n) {
    const day = today();
    if (!n || n > day) n = day;
    const p = puzzleById(n);
    $("game").hidden = !p;
    $("empty").hidden = !!p;
    if (!p) return;
    puzzle = p;
    const saved = store.games[n];
    game = saved && Array.isArray(saved.order) ? saved : L.newGame(p);
    selected = [];
    busy = false;
    $("puzzleNo").textContent = `Nr. ${n}`;
    $("puzzleDate").textContent = dateText(n, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    $("back").hidden = n === day;
    render();
  }

  function render() {
    board.textContent = "";
    board.classList.remove("locked");
    for (const level of L.shownLevels(game)) board.append(groupEl(level, false));
    if (game.status === "playing") for (const word of game.order) board.append(tileEl(word));
    renderMistakes();
    syncSelection();
    const over = game.status !== "playing";
    $("controls").hidden = over;
    $("mistakes").hidden = over;
    $("after").hidden = !over;
    $("prompt").hidden = over;
    fit();
  }

  function tileEl(word) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tile";
    b.dataset.word = word;
    b.textContent = word;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => toggle(word));
    return b;
  }

  function groupEl(level, animate) {
    const g = puzzle.groups[level];
    const el = document.createElement("div");
    el.className = animate ? "group reveal" : "group";
    el.dataset.level = level;
    const title = document.createElement("h3");
    title.textContent = g.title;
    const words = document.createElement("p");
    words.textContent = g.words.join(", ");
    el.append(title, words);
    return el;
  }

  const tileOf = (word) => board.querySelector(`.tile[data-word="${CSS.escape(word)}"]`);
  const tiles = () => [...board.querySelectorAll(".tile")];

  // Shrinks each tile's text until it fits. A long single word that would end up tiny
  // is split over two lines at a syllable break instead (PRIVI-GHETOARE).
  function fit(list = tiles()) {
    for (const t of list) {
      const word = t.dataset.word;
      t.textContent = word;
      if (shrink(t) >= 12 || /[ -]/.test(word)) continue;
      const split = hyphenate(word);
      if (split !== word) {
        t.textContent = split;
        shrink(t);
      }
    }
  }

  function shrink(t) {
    t.style.fontSize = "";
    let size = parseFloat(getComputedStyle(t).fontSize);
    while ((t.scrollWidth > t.clientWidth || t.scrollHeight > t.clientHeight) && size > 9) {
      size -= 0.5;
      t.style.fontSize = size + "px";
    }
    return size;
  }

  // Adds a soft hyphen at the vowel-consonant-vowel break nearest the middle of the word.
  // In Romanian a lone consonant (or CH/GH) between vowels starts the next syllable.
  const VOWELS = "AĂÂEIÎOU";
  function hyphenate(word) {
    const breaks = [];
    for (let i = 2; i < word.length - 2; i++) {
      const len = /^[CG]H$/.test(word.slice(i, i + 2)) ? 2 : 1;
      if (VOWELS.includes(word[i - 1]) && !VOWELS.includes(word[i]) && VOWELS.includes(word[i + len] || "")) breaks.push(i);
    }
    if (!breaks.length) return word;
    const mid = word.length / 2;
    const at = breaks.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
    return word.slice(0, at) + "­" + word.slice(at);
  }

  function renderMistakes() {
    const left = L.MAX_MISTAKES - game.mistakes;
    [...$("dots").children].forEach((dot, i) => dot.classList.toggle("used", i >= left));
    $("mistakesText").textContent = `${left} din ${L.MAX_MISTAKES}`;
  }

  // ---------- selecting ----------
  function toggle(word) {
    if (busy || game.status !== "playing") return;
    const i = selected.indexOf(word);
    if (i >= 0) selected.splice(i, 1);
    else if (selected.length < 4) selected.push(word);
    else return;
    syncSelection();
  }

  function syncSelection() {
    for (const t of tiles()) t.setAttribute("aria-pressed", String(selected.includes(t.dataset.word)));
    $("btnSubmit").disabled = busy || selected.length !== 4;
    $("btnDeselect").disabled = busy || selected.length === 0;
    $("btnShuffle").disabled = busy;
  }

  function deselect() {
    if (busy) return;
    selected = [];
    syncSelection();
  }

  // Moves tiles to a new order, sliding each one from its old place.
  function slideTo(order) {
    const els = tiles();
    const from = new Map(els.map((t) => [t, t.getBoundingClientRect()]));
    for (const word of order) board.append(tileOf(word));
    for (const t of els) {
      const a = from.get(t), b = t.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) t.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 380, easing: "cubic-bezier(.3,.7,.4,1)" });
    }
  }

  function shuffleTiles() {
    if (busy || game.status !== "playing") return;
    game = { ...game, order: L.shuffle(game.order) };
    if (store.games[puzzle.id]) persist();
    slideTo(game.order);
  }

  // ---------- guessing ----------
  async function submit() {
    if (busy || selected.length !== 4 || game.status !== "playing") return;
    const verdict = L.judge(puzzle, game, selected);
    if (verdict.result === "duplicate") { toast("Ai mai încercat combinația asta!"); return; }
    if (verdict.result === "invalid") return;

    busy = true;
    board.classList.add("locked");
    syncSelection();
    const picked = tiles().filter((t) => selected.includes(t.dataset.word));
    picked.forEach((t, i) => setTimeout(() => t.classList.add("hop"), i * 90));
    await wait(picked.length * 90 + 330);
    picked.forEach((t) => t.classList.remove("hop"));

    const guessed = selected.slice();
    const before = game;
    game = L.guess(puzzle, before, guessed).game;

    if (verdict.result === "correct") {
      const rest = await solveRow(verdict.level, guessed);
      game = { ...game, order: rest };
      selected = [];
    } else {
      picked.forEach((t) => t.classList.add("shake"));
      if (verdict.result === "oneAway") toast("Aproape! Unul e greșit.");
      await wait(450);
      picked.forEach((t) => t.classList.remove("shake"));
      renderMistakes();
      if (game.status === "lost") {
        selected = [];
        syncSelection();
        await wait(600);
        await revealRest();
      }
    }
    if (game.status !== "playing") game = { ...game, onDay: puzzle.id === today() };
    persist();
    busy = false;
    board.classList.remove("locked");
    syncSelection();
    if (game.status !== "playing") await finish();
  }

  // Slides a found group into the top free row and turns that row into the group's bar.
  // Returns the remaining words in their new order.
  async function solveRow(level, words) {
    const order = tiles().map((t) => t.dataset.word);
    const top = order.slice(0, 4);
    const leaving = top.filter((w) => !words.includes(w));
    const coming = order.slice(4).filter((w) => words.includes(w));
    coming.forEach((w, i) => {
      const a = order.indexOf(w), b = order.indexOf(leaving[i]);
      [order[a], order[b]] = [order[b], order[a]];
    });
    slideTo(order);
    await wait(420);
    for (const w of order.slice(0, 4)) tileOf(w).remove();
    const bar = groupEl(level, true);
    const firstTile = board.querySelector(".tile");
    if (firstTile) board.insertBefore(bar, firstTile); else board.append(bar);
    await wait(380);
    return order.slice(4);
  }

  // After the last mistake, show the groups that were not found, easiest first.
  async function revealRest() {
    for (const level of [0, 1, 2, 3].filter((l) => !game.solved.includes(l))) {
      selected = puzzle.groups[level].words.slice();
      syncSelection();
      await wait(500);
      await solveRow(level, selected);
      await wait(250);
    }
    selected = [];
  }

  async function finish() {
    await wait(game.status === "won" ? 900 : 500);
    render();
    openStats(true);
  }

  // ---------- messages ----------
  let toastTimer = 0;
  function toast(message, ms = 1900) {
    const t = $("toast");
    t.textContent = message;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  }

  // ---------- dialogs ----------
  function showDialog(id) {
    for (const d of document.querySelectorAll("dialog[open]")) d.close();
    $(id).showModal();
  }
  for (const d of document.querySelectorAll("dialog")) {
    d.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return d.close();
      const r = d.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (e.target === d && outside) d.close();
    });
  }

  const MISTAKE_LABELS = ["0 greșeli", "1 greșeală", "2 greșeli", "3 greșeli", "Pierdute"];

  // Statistics, with this game's result on top once it is over.
  function openStats(withResult) {
    const s = L.stats(store.games, today());
    $("stPlayed").textContent = s.played;
    $("stWin").textContent = s.winRate;
    $("stCurrent").textContent = s.current;
    $("stBest").textContent = s.best;
    $("stPerfect").textContent = s.perfect;

    const finished = !!game && game.status !== "playing";
    const mine = finished ? (game.status === "won" ? Math.min(game.mistakes, 3) : 4) : -1;
    const most = Math.max(1, ...s.spread);
    $("bars").textContent = "";
    s.spread.forEach((count, i) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      const label = document.createElement("span");
      label.textContent = MISTAKE_LABELS[i];
      const fill = document.createElement("div");
      fill.className = i === mine ? "fill now" : "fill";
      fill.style.width = `${Math.max(8, (100 * count) / most)}%`;
      fill.textContent = count;
      row.append(label, fill);
      $("bars").append(row);
    });

    const result = withResult && finished;
    $("result").hidden = !result;
    if (result) {
      $("resultTitle").textContent = game.status === "won" ? RESULT_TITLES[Math.min(game.mistakes, 3)] : "Data viitoare!";
      $("resultSub").textContent = `Legături nr. ${puzzle.id}`;
      $("mini").textContent = "";
      for (const g of game.guesses) for (const w of g) {
        const cell = document.createElement("i");
        cell.dataset.level = L.levelOf(puzzle, w);
        $("mini").append(cell);
      }
      $("btnShare").textContent = "Copiază rezultatul";
    }
    tick();
    showDialog("dlgStats");
  }

  // Time left until the next puzzle unlocks at local midnight.
  function tick() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    const pad = (x) => String(x).padStart(2, "0");
    $("countdown").textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    $("nextLine").hidden = !puzzleById(today() + 1);
  }
  setInterval(() => { if ($("dlgStats").open) tick(); }, 1000);

  async function share() {
    const text = L.shareText(puzzle, game, puzzle.id) + (SITE ? `\n${SITE}` : "");
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    $("btnShare").textContent = (await copy(text)) ? "Copiat ✓" : "Nu s-a putut copia";
    setTimeout(() => { $("btnShare").textContent = "Copiază rezultatul"; }, 2000);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0";
    $("dlgStats").append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    area.remove();
    return ok;
  }

  // "20 de puzzle-uri": Romanian adds "de" when the last two digits are 00 or 20-99.
  const countText = (n) => (n === 1 ? "1 puzzle" : `${n}${n >= 20 && (n % 100 === 0 || n % 100 >= 20) ? " de" : ""} puzzle-uri`);

  function openArchive() {
    const day = today();
    const last = Math.min(day, PUZZLES.length ? PUZZLES[PUZZLES.length - 1].id : 0);
    const list = $("archiveList");
    list.textContent = "";
    for (let n = last; n >= 1; n--) {
      if (!puzzleById(n)) continue;
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      if (puzzle && puzzle.id === n) b.className = "current";
      b.append(
        part("no", `Nr. ${n}`),
        part("when", n === day ? "Azi" : dateText(n, { weekday: "short", day: "numeric", month: "long" })),
        stateOf(store.games[n]),
      );
      b.addEventListener("click", () => { $("dlgArchive").close(); go(n); });
      li.append(b);
      list.append(li);
    }
    $("archiveNote").textContent = last > 0
      ? `${countText(last)} până acum. Un puzzle nou apare în fiecare zi.`
      : "Primul puzzle apare curând.";
    showDialog("dlgArchive");
  }

  function part(cls, text) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
  }

  // Unplayed, in progress, or the four groups (coloured when found) with the outcome.
  function stateOf(g) {
    const s = part("state", "");
    if (!g || !g.guesses || !g.guesses.length) { s.textContent = "Nejucat"; return s; }
    if (g.status === "playing") { s.textContent = "În curs"; return s; }
    for (const level of L.shownLevels(g)) {
      const cell = document.createElement("i");
      if (g.solved.includes(level)) cell.dataset.level = level;
      s.append(cell);
    }
    s.append(document.createTextNode(g.status === "won" ? " Rezolvat" : " Pierdut"));
    return s;
  }

  // ---------- navigation ----------
  const fromHash = () => { const m = /^#(\d+)$/.exec(location.hash); return m ? Number(m[1]) : 0; };
  function go(n) {
    const url = n === today() ? location.pathname + location.search : `#${n}`;
    if (url !== location.pathname + location.search + location.hash) history.pushState(null, "", url);
    open(n);
  }

  // ---------- theme ----------
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const theme = () => document.documentElement.dataset.theme || (darkQuery.matches ? "dark" : "light");
  function syncTheme() {
    const label = theme() === "dark" ? "Temă luminoasă" : "Temă întunecată";
    $("btnTheme").title = label;
    $("btnTheme").setAttribute("aria-label", label);
    document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  }

  // ---------- wiring ----------
  $("btnShuffle").addEventListener("click", shuffleTiles);
  $("btnDeselect").addEventListener("click", deselect);
  $("btnSubmit").addEventListener("click", submit);
  $("btnResults").addEventListener("click", () => openStats(true));
  $("btnMore").addEventListener("click", openArchive);
  $("btnEmptyArchive").addEventListener("click", openArchive);
  $("btnArchive").addEventListener("click", openArchive);
  $("btnStats").addEventListener("click", () => openStats(true));
  $("btnHelp").addEventListener("click", () => showDialog("dlgHelp"));
  $("btnShare").addEventListener("click", share);
  $("btnToday").addEventListener("click", () => go(today()));
  $("btnHome").addEventListener("click", () => go(today()));
  $("btnTheme").addEventListener("click", () => {
    store.theme = theme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = store.theme;
    save();
    syncTheme();
  });
  darkQuery.addEventListener("change", syncTheme);
  addEventListener("popstate", () => open(fromHash()));

  let fitFrame = 0;
  addEventListener("resize", () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(() => fit()); });
  if (document.fonts) document.fonts.ready.then(() => fit());

  // A tab left open overnight moves on to the new daily puzzle when it is viewed again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || fromHash() || busy) return;
    if (!puzzle || puzzle.id !== today()) open(today());
  });

  syncTheme();
  open(fromHash());
  if (!store.seenHelp) {
    store.seenHelp = true;
    save();
    showDialog("dlgHelp");
  }
})();
