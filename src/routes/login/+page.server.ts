import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasUsers } from '#lib/server/auth.ts';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { firstRun: !hasUsers() };
};
