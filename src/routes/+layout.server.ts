import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

const PUBLIC = ['/login'];

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user && !PUBLIC.includes(url.pathname)) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return { user: locals.user };
};
