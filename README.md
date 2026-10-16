# Daily Games

A one-page launcher for my daily games, played in order:

1. Wordle România
2. Wordle (NYT)
3. Connections (NYT)
4. Size It Up
5. GeoGuessr Daily Challenge

## How to use

- Press **Start / Next** (or `Enter` / `Space`) — the next game opens in a new tab and gets checked off.
- Finish it, come back to this tab, press again.
- **Open all in tabs** opens every remaining game at once (allow pop-ups for the site the first time).
- **Edit games** lets you add, remove, reorder or change links.
- Progress resets automatically each day; the streak counts days where you finished everything.

Everything is stored in your browser (`localStorage`) — no server, no account.

## Running it

- Online: GitHub Pages (free) — `https://amphoitza.github.io/`
- Offline: just double-click `index.html`.

## Wordle opener (optional)

`wordle-penis.user.js` types a first word into Wordle România and NYT Wordle once a day.

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension (in Chrome, also turn on "Allow user scripts" for it in the extension's details page).
2. Open https://amphoitza.github.io/wordle-penis.user.js and click **Install**.

Change `WORD` or set `SUBMIT = false` at the top of the script to only type the word.
