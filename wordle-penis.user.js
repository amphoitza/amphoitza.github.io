// ==UserScript==
// @name         Amphoitza – Wordle opener
// @namespace    https://amphoitza.github.io/
// @version      1.0
// @description  Types the first word for you in Wordle România and NYT Wordle, once a day.
// @match        https://wordle-ro.sirb.net/*
// @match        https://www.nytimes.com/games/wordle/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://amphoitza.github.io/wordle-penis.user.js
// @updateURL    https://amphoitza.github.io/wordle-penis.user.js
// ==/UserScript==

(() => {
  const WORD = "PENIS";
  const SUBMIT = true; // false = only type the word, you press Enter yourself

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = new Date().toISOString().slice(0, 10);
  const DONE_KEY = "amphoitza-opener-" + location.hostname;

  async function waitFor(fn, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(200);
    }
    return null;
  }

  const buttons = () => [...document.querySelectorAll("button, [role=button]")];
  const byText = (re) => buttons().find((b) => re.test(b.textContent.trim()));

  function findKey(k) {
    const lower = k.toLowerCase();
    return (
      document.querySelector(`button[data-key="${lower}"], button[data-key="${k}"]`) ||
      buttons().find((b) => b.textContent.trim().toUpperCase() === k && b.textContent.trim().length === 1)
    );
  }

  function findEnter() {
    return document.querySelector('button[data-key="↵"], button[data-key="enter"]') || byText(/^(enter|ghici!?)$/i);
  }

  function sendKey(key) {
    for (const type of ["keydown", "keyup"]) {
      document.dispatchEvent(new KeyboardEvent(type, { key, code: key.length === 1 ? "Key" + key.toUpperCase() : key, bubbles: true }));
    }
  }

  async function press(btn, fallbackKey) {
    if (btn) btn.click();
    else sendKey(fallbackKey);
    await sleep(90);
  }

  // Has a guess already been made today? Then leave the board alone.
  function alreadyStarted() {
    try {
      const s = JSON.parse(localStorage.getItem("gameState"));
      if (s && Array.isArray(s.guesses) && s.guesses.length) return true;
    } catch (e) {}
    const tiles = document.querySelectorAll('[data-testid="tile"], [class*="Tile-module_tile"], [aria-roledescription="tile"]');
    return [...tiles].some((t) => /[A-Za-z]/.test(t.textContent));
  }

  async function run() {
    if (localStorage.getItem(DONE_KEY) === today) return;

    // NYT shows a welcome screen with a "Play" button first.
    const play = await waitFor(() => byText(/^play$/i) || document.querySelector('[data-testid="Play"]'), 5000);
    if (play) { play.click(); await sleep(800); }

    // Close the "How to play" popup if it shows up.
    const close = await waitFor(() => document.querySelector('[aria-label="Close"], button[class*="closeIcon"]'), 1500);
    if (close) { close.click(); await sleep(400); }

    const keyboard = await waitFor(() => findKey("Q"));
    if (!keyboard) return;
    if (alreadyStarted()) { localStorage.setItem(DONE_KEY, today); return; }

    for (const ch of WORD) await press(findKey(ch), ch.toLowerCase());
    if (SUBMIT) { await sleep(150); await press(findEnter(), "Enter"); }
    localStorage.setItem(DONE_KEY, today);
  }

  run();
})();
