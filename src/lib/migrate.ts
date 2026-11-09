import { openDB } from 'idb';

/**
 * One-time move of data saved by the earlier browser-only version (IndexedDB) into the SQLite server.
 * Runs for the first account that signs in on this browser; the old data is left in place untouched.
 */
const FLAG = 'cd-idb-migrated';

export async function migrateBrowserData(): Promise<string | null> {
	try {
		if (localStorage.getItem(FLAG)) return null;
		const dbs = (await indexedDB.databases?.()) ?? [];
		if (!dbs.some((d) => d.name === 'chess-despotes')) {
			localStorage.setItem(FLAG, 'none');
			return null;
		}
		const old = await openDB('chess-despotes', 1);
		const names = ['games', 'libraries', 'cards', 'kv'].filter((n) => old.objectStoreNames.contains(n));
		const all = async (n: string) => (names.includes(n) ? old.getAll(n) : []);
		const kv: Record<string, unknown> = {};
		if (names.includes('kv')) for (const k of await old.getAllKeys('kv')) kv[String(k)] = await old.get('kv', k);
		const payload = { app: 'chess-despotes', games: await all('games'), libraries: await all('libraries'), cards: await all('cards'), kv };
		old.close();
		const total = payload.games.length + payload.libraries.length + payload.cards.length + Object.keys(kv).length;
		if (total) {
			const r = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
			if (!r.ok) return null; // try again next time
		}
		localStorage.setItem(FLAG, new Date().toISOString());
		return total
			? `Moved your earlier data into the database: ${payload.games.length} games, ${payload.libraries.length} libraries, ${payload.cards.length} review cards.`
			: null;
	} catch {
		return null;
	}
}
