import { db, STORES, type Store } from './db.ts';

/** Document-store operations, always scoped to one user. Mirrors the small subset of IndexedDB the app uses. */

function check(store: string): asserts store is Store {
	if (!(STORES as readonly string[]).includes(store)) throw new Error(`Unknown store ${store}`);
}

/** The record's own key field per store (kv has external keys). */
const KEY_FIELD: Record<Store, string | null> = { games: 'id', libraries: 'id', cards: 'key', kv: null };

export function get(user: number, store: string, key: string) {
	check(store);
	const row = db.prepare(`SELECT data FROM ${store} WHERE user_id = ? AND id = ?`).get(user, key) as { data: string } | undefined;
	return row ? JSON.parse(row.data) : undefined;
}

export function getAll(user: number, store: string, lib?: string) {
	check(store);
	const rows = (lib !== undefined && store === 'cards'
		? db.prepare(`SELECT data FROM cards WHERE user_id = ? AND lib = ?`).all(user, lib)
		: db.prepare(`SELECT data FROM ${store} WHERE user_id = ?`).all(user)) as { data: string }[];
	return rows.map((r) => JSON.parse(r.data));
}

export function keys(user: number, store: string, lib?: string): string[] {
	check(store);
	const rows = (lib !== undefined && store === 'cards'
		? db.prepare(`SELECT id FROM cards WHERE user_id = ? AND lib = ?`).all(user, lib)
		: db.prepare(`SELECT id FROM ${store} WHERE user_id = ?`).all(user)) as { id: string }[];
	return rows.map((r) => r.id);
}

export function count(user: number, store: string) {
	check(store);
	return (db.prepare(`SELECT count(*) n FROM ${store} WHERE user_id = ?`).get(user) as { n: number }).n;
}

export function put(user: number, store: string, value: unknown, key?: string) {
	check(store);
	const field = KEY_FIELD[store];
	const id = field ? String((value as Record<string, unknown>)[field]) : key;
	if (!id || id === 'undefined') throw new Error(`Missing key for ${store}`);
	db.prepare(`INSERT INTO ${store} (user_id, id, data) VALUES (?, ?, ?) ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data`).run(
		user,
		id,
		JSON.stringify(value)
	);
}

export function del(user: number, store: string, key: string) {
	check(store);
	db.prepare(`DELETE FROM ${store} WHERE user_id = ? AND id = ?`).run(user, key);
}

export function delByLib(user: number, lib: string) {
	db.prepare(`DELETE FROM cards WHERE user_id = ? AND lib = ?`).run(user, lib);
}
