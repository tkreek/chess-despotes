import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE, createSession, deleteSession, login, register } from '#lib/server/auth.ts';

/** POST { action: 'login' | 'register' | 'logout', username?, password? } */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const { action, username = '', password = '' } = await request.json();
	if (action === 'logout') {
		deleteSession(cookies.get(SESSION_COOKIE));
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return json({ ok: true });
	}
	if (action !== 'login' && action !== 'register') error(400, 'Unknown action');
	try {
		const user = action === 'register' ? await register(String(username).trim(), String(password)) : await login(String(username).trim(), String(password));
		const s = createSession(user.id);
		cookies.set(SESSION_COOKIE, s.token, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', expires: s.expires });
		return json({ user });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
	}
};
