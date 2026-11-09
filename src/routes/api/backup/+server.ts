import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.ts';
import * as store from '#lib/server/store.ts';

/** Full export of the signed-in user's data (same shape as the old browser backup). */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const u = locals.user.id;
	const kv = Object.fromEntries(store.keys(u, 'kv').map((k) => [k, store.get(u, 'kv', k)]));
	return json({
		app: 'chess-despotes',
		version: 2,
		exportedAt: new Date().toISOString(),
		games: store.getAll(u, 'games'),
		libraries: store.getAll(u, 'libraries'),
		cards: store.getAll(u, 'cards'),
		kv
	});
};

/** Bulk import/merge (used by Settings → Restore and the one-time browser-data migration). */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Not signed in');
	const u = locals.user.id;
	const data = await request.json();
	if (data?.app !== 'chess-despotes') error(400, 'Not a Chess Despotes backup');
	const counts = { games: 0, libraries: 0, cards: 0, kv: 0 };
	db.transaction(() => {
		for (const g of data.games ?? []) (store.put(u, 'games', g), counts.games++);
		for (const l of data.libraries ?? []) (store.put(u, 'libraries', l), counts.libraries++);
		for (const c of data.cards ?? []) (store.put(u, 'cards', c), counts.cards++);
		for (const [k, v] of Object.entries(data.kv ?? {})) (store.put(u, 'kv', v, k), counts.kv++);
	})();
	return json(counts);
};
