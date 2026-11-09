import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { themePayload } from '#lib/server/omarchy.ts';

export const GET: RequestHandler = () => {
	const body = themePayload();
	return body ? json(body, { headers: { 'Cache-Control': 'no-store' } }) : json({}, { status: 404 });
};
