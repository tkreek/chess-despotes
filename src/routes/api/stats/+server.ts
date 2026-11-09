import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { statsFor } from '#lib/server/stats.ts';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	return json(statsFor(locals.user.id));
};
