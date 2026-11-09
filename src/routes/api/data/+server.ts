import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as store from '#lib/server/store.ts';

/** Small RPC: POST { op, store, key?, value?, lib? } → { result } */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const u = locals.user.id;
	const { op, store: s, key, value, lib } = await request.json();
	try {
		switch (op) {
			case 'get': return json({ result: store.get(u, s, key) ?? null });
			case 'getAll': return json({ result: store.getAll(u, s, lib) });
			case 'keys': return json({ result: store.keys(u, s, lib) });
			case 'count': return json({ result: store.count(u, s) });
			case 'put': store.put(u, s, value, key); return json({ result: true });
			case 'delete': store.del(u, s, key); return json({ result: true });
			case 'deleteLib': store.delByLib(u, lib); return json({ result: true });
			default: error(400, `Unknown op ${op}`);
		}
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(400, e instanceof Error ? e.message : String(e));
	}
};
