import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Lichess study search isn't CORS-enabled, so the server fetches it. Only search/listing pages are allowed. */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	if (!/^(search|all\/(popular|hot|newest|updated))$/.test(params.path)) error(404, 'Not found');
	const r = await fetch(`https://lichess.org/study/${params.path}${url.search}`, {
		headers: { Accept: 'application/json', 'User-Agent': 'chess-despotes (personal study app)' }
	});
	return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') ?? 'application/json' } });
};
