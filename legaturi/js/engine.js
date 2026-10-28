// Game rules for Legături. No page access here, so the tests can run it in Node.
(function (root) {
  "use strict";

  // Puzzle 1 belongs to this local date. A new puzzle unlocks at every local midnight.
  const EPOCH = [2026, 10, 28];
  const MAX_MISTAKES = 4;
  const EMOJI = ["🟨", "🟩", "🟦", "🟥"];
  const DAY_MS = 86400000;

  // Count calendar days through UTC, so daylight-saving changes never skip or repeat a puzzle.
  const dayIndex = (y, m, d) => Math.round(Date.UTC(y, m, d) / DAY_MS);
  const EPOCH_INDEX = dayIndex(EPOCH[0], EPOCH[1] - 1, EPOCH[2]);

  function numberForDate(date) {
    return dayIndex(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH_INDEX + 1;
  }

  function dateForNumber(n) {
    const d = new Date((EPOCH_INDEX + n - 1) * DAY_MS);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  // Seeded random numbers (mulberry32), so every player starts from the same layout.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, random = Math.random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const levelOf = (puzzle, word) => puzzle.groups.findIndex((g) => g.words.includes(word));
  const sameSet = (a, b) => a.length === b.length && a.every((w) => b.includes(w));

  // True when some row of four holds three or more words of one group.
  function hasCluster(puzzle, order) {
    for (let row = 0; row < order.length; row += 4) {
      const counts = [0, 0, 0, 0];
      for (const w of order.slice(row, row + 4)) counts[levelOf(puzzle, w)]++;
      if (counts.some((c) => c >= 3)) return true;
    }
    return false;
  }

  // The opening layout: seeded by the puzzle id, and no row gives a group away.
  function startOrder(puzzle) {
    const words = puzzle.groups.flatMap((g) => g.words);
    const random = rng(puzzle.id * 7919 + 17);
    let order = shuffle(words, random);
    for (let tries = 0; tries < 500 && hasCluster(puzzle, order); tries++) order = shuffle(words, random);
    return order;
  }

  // `order` holds the unsolved words as shown. `solved` lists group levels in the order they were found.
  function newGame(puzzle) {
    return { id: puzzle.id, order: startOrder(puzzle), solved: [], guesses: [], mistakes: 0, status: "playing" };
  }

  // Judges four selected words without changing the game.
  // result: "correct" (with level), "oneAway", "wrong", "duplicate" or "invalid".
  function judge(puzzle, game, selection) {
    if (game.status !== "playing" || selection.length !== 4) return { result: "invalid" };
    if (selection.some((w) => !game.order.includes(w))) return { result: "invalid" };
    if (game.guesses.some((g) => sameSet(g, selection))) return { result: "duplicate" };
    const counts = [0, 0, 0, 0];
    for (const w of selection) counts[levelOf(puzzle, w)]++;
    const level = counts.indexOf(4);
    if (level >= 0) return { result: "correct", level };
    return { result: counts.includes(3) ? "oneAway" : "wrong" };
  }

  // Applies a guess. Returns the next game (a new object) and the verdict.
  function guess(puzzle, game, selection) {
    const verdict = judge(puzzle, game, selection);
    if (verdict.result === "invalid" || verdict.result === "duplicate") return { game, verdict };
    const next = { ...game, guesses: [...game.guesses, selection.slice()] };
    if (verdict.result === "correct") {
      next.solved = [...game.solved, verdict.level];
      next.order = game.order.filter((w) => !selection.includes(w));
      if (next.solved.length === 4) next.status = "won";
    } else {
      next.mistakes = game.mistakes + 1;
      if (next.mistakes >= MAX_MISTAKES) next.status = "lost";
    }
    return { game: next, verdict };
  }

  // Levels in the order they appear on the board: found groups first, then (after a loss) the rest, easiest first.
  function shownLevels(game) {
    if (game.status !== "lost") return game.solved.slice();
    return game.solved.concat([0, 1, 2, 3].filter((l) => !game.solved.includes(l)));
  }

  function shareText(puzzle, game, number) {
    const rows = game.guesses.map((g) => g.map((w) => EMOJI[levelOf(puzzle, w)]).join(""));
    return [`Legături nr. ${number}`, ...rows].join("\n");
  }

  // games: saved games by puzzle number. `onDay` marks games finished on the puzzle's own date;
  // only those count for streaks. Everything finished counts for the other numbers.
  function stats(games, today) {
    const finished = Object.values(games).filter((g) => g.status === "won" || g.status === "lost");
    const wins = finished.filter((g) => g.status === "won");
    const spread = [0, 0, 0, 0, 0]; // wins with 0-3 mistakes, then losses
    for (const g of finished) spread[g.status === "won" ? Math.min(g.mistakes, 3) : 4]++;
    const dailyWin = (n) => games[n] && games[n].status === "won" && games[n].onDay;

    let current = 0;
    if (!(games[today] && games[today].status === "lost" && games[today].onDay)) {
      let n = dailyWin(today) ? today : today - 1;
      while (n >= 1 && dailyWin(n)) { current++; n--; }
    }
    let best = 0, run = 0;
    for (let n = 1; n <= today; n++) { run = dailyWin(n) ? run + 1 : 0; best = Math.max(best, run); }

    return {
      played: finished.length,
      winRate: finished.length ? Math.round((100 * wins.length) / finished.length) : 0,
      current,
      best,
      perfect: wins.filter((g) => g.mistakes === 0).length,
      spread,
    };
  }

  const api = {
    EPOCH, MAX_MISTAKES, EMOJI, numberForDate, dateForNumber, rng, shuffle, levelOf, hasCluster,
    startOrder, newGame, judge, guess, shownLevels, shareText, stats,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Legaturi = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
