# Chess Despotes

A private, local-first chess study app for **learning openings**, solving **puzzles**, and **reviewing your own games** with a lightweight engine.

- **Openings** — explore repertoire lines with commentary then drill with spaced repetition (the opponent steers toward lines that are new or due).
- **Checklist** — every named opening (lichess ECO catalog, ~3,300 entries) as Opening → Variation → Sub-variation; tick off what you've learned, tick whole branches, search by name or ECO, filter to started / to learn / learned, and preview any line on a board.
- **Puzzles** — ~3,000 curated lichess puzzles (ratings 400–2900), rating-matched, filterable by theme.
- **Play** — play Stockfish at 7 strength levels, optionally with the engine following one of your repertoires so you can practice it in real games. Finished games auto-save.
- **My Games / Analysis** — import PGNs, run a full engine review (accuracy, inaccuracies/mistakes/blunders, eval graph), and see exactly where a game left your repertoire.

- **Vision** — coordinate trainer (click the named square within 1–5 s, or a 30-second rush; as White, Black or random; coordinates on or off), a blind square-color drill, and blindfold games against the engine (type moves, hidden pieces, hold-to-peek, optional spoken moves).
- **Stats** — puzzle rating over time, solve rate by theme, drill time per day and accuracy, strongest openings from your games (score and review accuracy) and from your drills, checklist completion.
- **Accounts** — simple local username/password accounts; every account has its own data.

Engine: Stockfish 19 *lite single-threaded* WASM (~1.8 MB, in `static/engine/`) runs in the browser. Data lives in a local **SQLite** database served by a small Node server.

## Run

```sh
npm install
npm run build && npm start   # http://127.0.0.1:4317  (PORT / HOST env to change)
npm run dev -- --port 4317   # development with hot reload (same database)
```

The first visit asks you to create an account. If you used the earlier browser-only version, its data (games, libraries, review progress, puzzle stats) is moved into the database automatically the first time you sign in on that browser — keep the same address (port 4317) so the browser can find it.

## Data

Everything is in one SQLite file: `~/.local/share/chess-despotes/chess.db` (override with `CHESS_DB=/path/to.db`).

| table | contents |
|---|---|
| `users`, `sessions` | accounts (scrypt-hashed passwords) and sign-in sessions |
| `games`, `libraries`, `cards`, `kv` | per-user JSON documents, with readable generated columns (`opening`, `result`, `my_color`, `lib`, `due`, …) |
| `puzzle_attempts` | every rated puzzle: rating, themes, result, hint used, time taken, your rating after |
| `drill_events` | every graded drill answer: library, position, correct, new or review, think time (capped at 60s) |

Query it directly, e.g.:

```sh
sqlite3 ~/.local/share/chess-despotes/chess.db \
  "select lib_name, count(*), round(avg(correct)*100) || '%' from drill_events group by 1"
```

Settings → Export/Restore backup still produces/reads a portable JSON file per account.

## Adding opening libraries

Libraries are plain **PGN**. Either drop a `.pgn` file into `openings/` (built in, picked up automatically) or import it in the app (Openings → Add library, or drag & drop a file).

- Each game in the file is a **chapter**; `( … )` variations become branches; `{ … }` comments appear while studying.
- Optional headers: `[Library "Name"]`, `[Side "white"|"black"]` (the side you're learning), `[Description "…"]`, `[Event "Chapter name"]`, `[FEN "…"]` for custom starting positions.
- **Lichess study exports work as-is** (`StudyName`, `ChapterName`, `Orientation` are understood).
- Transpositions are merged across chapters, so the same position reached by different move orders is one flashcard.

### Import from Lichess

Openings → **⌕ Lichess studies**: search public studies (sort by popular/hot/newest/updated), type `@username` to list someone's studies, or paste a study URL. Preview the chapters (with move/comment/arrow counts), untick ones you don't want, pick your side, and import. Re-importing the same study updates it. Study comments are shown while exploring and drilling, and `[%cal]` arrows / `[%csl]` highlights are drawn on the board in Explore mode (toggleable; hidden in Drill so they don't give answers away). You can also draw your own arrows anywhere with right-click-drag.

Search goes through the app's server (`src/routes/lichess-study/`) because Lichess's search pages aren't CORS-enabled; study downloads use the public `/api` directly.

Run `npm run openings:check` to verify every move in `openings/*.pgn` is legal.

## Data scripts

- `npm run data:eco` — rebuilds opening names (`static/data/eco.json`) from the lichess `chess-openings` TSVs in `data/`.
- `npm run data:puzzles [csv] [perBand]` — rebuilds `static/puzzles/puzzles.json`. For a bigger set:
  ```sh
  curl -L https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | head -n 400000 > data/puzzles.csv
  npm run data:puzzles data/puzzles.csv 400
  ```

## License

Chess Despotes is free software under the **GNU GPL v3.0 or later** (see `LICENSE`), because it bundles GPL components.

Third-party:
- [Stockfish](https://stockfishchess.org/) 19 lite WASM via [Stockfish.js](https://github.com/nmrugg/stockfish.js) — GPL-3.0 (see `static/engine/README.md`)
- [chessground](https://github.com/lichess-org/chessground) board and cburnett pieces — GPL-3.0-or-later
- [chess.js](https://github.com/jhlywa/chess.js) — BSD-2-Clause; [@mliebelt/pgn-parser](https://github.com/mliebelt/pgn-parser) — Apache-2.0
- Puzzles ([lichess puzzle database](https://database.lichess.org/#puzzles)) and opening names ([lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)) — CC0
- Lichess studies you import belong to their authors; they're stored only in your local database.

## Layout

```
openings/              built-in PGN libraries
src/lib/chess/         engine wrapper, PGN→repertoire tree, ECO names, helpers
src/lib/components/    Board (chessground), eval bar/graph, engine lines, move list
src/lib/server/        SQLite schema, auth, stores, stats, Omarchy theme reader (server-only)
src/lib/{db,srs,games,puzzles,checklist,events}.ts   data client, spaced repetition, review, puzzles, checklist, analytics
src/routes/api/        auth, data, events, stats, backup endpoints
src/routes/            openings, checklist, puzzles, play, games, analysis, stats, settings, login
```

## Omarchy theme

The UI is styled after Omarchy itself: your monospace font everywhere (from fontconfig, sized from the theme's `shell.toml`), square TUI boxes with titles in the border, quiet controls, an accent "active window" border on the board, a status bar, and `1`–`7` keys for navigation.

The app follows your active Omarchy theme live: the server (`src/lib/server/omarchy.ts`) serves `~/.local/state/omarchy/current/theme/colors.toml` (plus your monospace font) at `/omarchy-theme.json`, and the app maps it onto its color tokens, including an "Omarchy" board style derived from the palette. Run `omarchy theme set <name>` and the app restyles within ~2 seconds. Turn it off in Settings → Appearance.
