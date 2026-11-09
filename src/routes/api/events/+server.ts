import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db.ts';

const num = (v: unknown, max = Infinity) => Math.max(0, Math.min(max, Number(v) || 0));

/** Analytics events. POST { type: 'puzzle' | 'drill' | 'vision', ... } */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Not signed in');
	const u = locals.user.id;
	const e = await request.json();
	const at = Date.now();
	if (e.type === 'puzzle') {
		db.prepare(
			`INSERT INTO puzzle_attempts (user_id, puzzle_id, puzzle_rating, themes, win, used_hint, rating_after, seconds, at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(u, String(e.puzzleId), num(e.puzzleRating, 4000), String(e.themes ?? ''), e.win ? 1 : 0, e.usedHint ? 1 : 0, num(e.ratingAfter, 4000), num(e.seconds, 3600), at);
	} else if (e.type === 'drill') {
		db.prepare(
			`INSERT INTO drill_events (user_id, lib, lib_name, position, correct, was_new, seconds, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		).run(u, String(e.lib), String(e.libName ?? e.lib), String(e.position), e.correct ? 1 : 0, e.wasNew ? 1 : 0, num(e.seconds, 120), at);
	} else if (e.type === 'vision') {
		if (!['coords', 'rush', 'colors', 'blindfold'].includes(e.mode)) error(400, 'Unknown vision mode');
		db.prepare(`INSERT INTO vision_sessions (user_id, mode, variant, hits, misses, avg_ms, seconds, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
			u, e.mode, String(e.variant ?? ''), num(e.hits, 1e5), num(e.misses, 1e5), e.avgMs == null ? null : num(e.avgMs, 6e4), num(e.seconds, 86400), at
		);
	} else error(400, 'Unknown event type');
	return json({ ok: true });
};
