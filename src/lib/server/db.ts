import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * One SQLite file holds everything. Default: ~/.local/share/chess-despotes/chess.db (override with CHESS_DB).
 * Document tables keep the app's JSON in `data`, with generated columns so the file is easy to query by hand:
 *   sqlite3 ~/.local/share/chess-despotes/chess.db "select opening, result, count(*) from games group by 1, 2"
 */
export const DB_PATH = process.env.CHESS_DB ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'), 'chess-despotes/chess.db');

const MIGRATIONS: string[] = [
	`
	CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		username TEXT NOT NULL UNIQUE COLLATE NOCASE,
		password_hash TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);
	CREATE TABLE sessions (
		token TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL
	);

	CREATE TABLE games (
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		id TEXT NOT NULL,
		data TEXT NOT NULL,
		white TEXT GENERATED ALWAYS AS (json_extract(data, '$.white')) VIRTUAL,
		black TEXT GENERATED ALWAYS AS (json_extract(data, '$.black')) VIRTUAL,
		result TEXT GENERATED ALWAYS AS (json_extract(data, '$.result')) VIRTUAL,
		my_color TEXT GENERATED ALWAYS AS (json_extract(data, '$.myColor')) VIRTUAL,
		opening TEXT GENERATED ALWAYS AS (json_extract(data, '$.opening')) VIRTUAL,
		created_at INTEGER GENERATED ALWAYS AS (json_extract(data, '$.createdAt')) VIRTUAL,
		PRIMARY KEY (user_id, id)
	);
	CREATE TABLE libraries (
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		id TEXT NOT NULL,
		data TEXT NOT NULL,
		name TEXT GENERATED ALWAYS AS (json_extract(data, '$.name')) VIRTUAL,
		source TEXT GENERATED ALWAYS AS (json_extract(data, '$.source')) VIRTUAL,
		PRIMARY KEY (user_id, id)
	);
	CREATE TABLE cards (
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		id TEXT NOT NULL,
		data TEXT NOT NULL,
		lib TEXT GENERATED ALWAYS AS (json_extract(data, '$.lib')) VIRTUAL,
		due INTEGER GENERATED ALWAYS AS (json_extract(data, '$.due')) VIRTUAL,
		reps INTEGER GENERATED ALWAYS AS (json_extract(data, '$.reps')) VIRTUAL,
		PRIMARY KEY (user_id, id)
	);
	CREATE INDEX cards_lib ON cards(user_id, lib);
	CREATE TABLE kv (
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		id TEXT NOT NULL,
		data TEXT NOT NULL,
		PRIMARY KEY (user_id, id)
	);

	-- Analytics event logs
	CREATE TABLE puzzle_attempts (
		id INTEGER PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		puzzle_id TEXT NOT NULL,
		puzzle_rating INTEGER NOT NULL,
		themes TEXT NOT NULL,
		win INTEGER NOT NULL,
		used_hint INTEGER NOT NULL,
		rating_after INTEGER NOT NULL,
		seconds REAL NOT NULL,
		at INTEGER NOT NULL
	);
	CREATE INDEX puzzle_attempts_user ON puzzle_attempts(user_id, at);
	CREATE TABLE drill_events (
		id INTEGER PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		lib TEXT NOT NULL,
		lib_name TEXT NOT NULL,
		position TEXT NOT NULL,
		correct INTEGER NOT NULL,
		was_new INTEGER NOT NULL,
		seconds REAL NOT NULL,
		at INTEGER NOT NULL
	);
	CREATE INDEX drill_events_user ON drill_events(user_id, at);
	`,
	`
	-- Board-vision training sessions (coordinates, square colors, blindfold games)
	CREATE TABLE vision_sessions (
		id INTEGER PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		mode TEXT NOT NULL,          -- 'coords' | 'rush' | 'colors' | 'blindfold'
		variant TEXT NOT NULL,       -- e.g. '2s · black' or engine level
		hits INTEGER NOT NULL,
		misses INTEGER NOT NULL,
		avg_ms REAL,                 -- average time to a correct answer
		seconds REAL NOT NULL,       -- session length
		at INTEGER NOT NULL
	);
	CREATE INDEX vision_sessions_user ON vision_sessions(user_id, mode, at);
	`
];

function open() {
	mkdirSync(dirname(DB_PATH), { recursive: true });
	const db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	const version = db.pragma('user_version', { simple: true }) as number;
	for (let v = version; v < MIGRATIONS.length; v++) {
		db.transaction(() => {
			db.exec(MIGRATIONS[v]);
			db.pragma(`user_version = ${v + 1}`);
		})();
	}
	return db;
}

const g = globalThis as unknown as { __chessDb?: Database.Database };
/** Shared connection (kept across dev-server hot reloads). */
export const db = (g.__chessDb ??= open());

export const STORES = ['games', 'libraries', 'cards', 'kv'] as const;
export type Store = (typeof STORES)[number];
