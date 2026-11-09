
export interface GameReview {
	evals: number[]; // white-POV cp per position (index 0 = start)
	best: string[]; // best move (uci) per position
	classes: (null | 'inaccuracy' | 'mistake' | 'blunder' | 'book')[]; // per ply (index 0 = first move)
	accuracy: { white: number; black: number };
	depth: number;
}

export interface SavedGame {
	id: string;
	pgn: string;
	white: string;
	black: string;
	result: string;
	date: string;
	myColor: 'white' | 'black' | null;
	source: 'engine' | 'import';
	opening?: string;
	plies: number;
	createdAt: number;
	review?: GameReview;
}

export interface UserLibrary {
	id: string;
	name: string;
	pgn: string;
	createdAt: number;
	/** e.g. https://lichess.org/study/abcd1234 for imported studies */
	source?: string;
}

export interface Card {
	key: string; // `${libId}|${epd}`
	lib: string;
	due: number;
	interval: number; // days
	ease: number;
	reps: number;
	lapses: number;
	last: number;
}

interface Schema {
	games: SavedGame;
	libraries: UserLibrary;
	cards: Card;
	kv: unknown;
}
type StoreName = keyof Schema;

async function rpc<T>(body: Record<string, unknown>): Promise<T> {
	const r = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	if (r.status === 401) {
		location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
		throw new Error('Not signed in');
	}
	if (!r.ok) throw new Error(`Storage error: ${await r.text()}`);
	return ((await r.json()) as { result: T }).result;
}

/**
 * Data access, backed by the server's SQLite database (see src/lib/server/).
 * Keeps the same small IndexedDB-style API the rest of the app was written against.
 */
const client = {
	get: <S extends StoreName>(store: S, key: string) => rpc<Schema[S] | undefined>({ op: 'get', store, key }).then((v) => v ?? undefined),
	getAll: <S extends StoreName>(store: S) => rpc<Schema[S][]>({ op: 'getAll', store }),
	getAllKeys: (store: StoreName) => rpc<string[]>({ op: 'keys', store }),
	count: (store: StoreName) => rpc<number>({ op: 'count', store }),
	// JSON round-trip strips Svelte state proxies before sending
	put: <S extends StoreName>(store: S, value: Schema[S], key?: string) => rpc<true>({ op: 'put', store, value: JSON.parse(JSON.stringify(value)), key }),
	delete: (store: StoreName, key: string) => rpc<true>({ op: 'delete', store, key }),
	getAllFromIndex: (_store: 'cards', _index: 'lib', lib: string) => rpc<Card[]>({ op: 'getAll', store: 'cards', lib }),
	getAllKeysFromIndex: (_store: 'cards', _index: 'lib', lib: string) => rpc<string[]>({ op: 'keys', store: 'cards', lib })
};

export async function db() {
	return client;
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
	return ((await client.get('kv', key)) as T | undefined) ?? fallback;
}
export async function kvSet(key: string, value: unknown) {
	await client.put('kv', value, key);
}
