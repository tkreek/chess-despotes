import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.ts';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = 'cd_session';
const SESSION_DAYS = 60;

export interface User {
	id: number;
	username: string;
}

export async function hashPassword(pw: string) {
	const salt = randomBytes(16);
	const hash = await scrypt(pw, salt, 64);
	return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(pw: string, stored: string) {
	const [, salt, hash] = stored.split('$');
	const expected = Buffer.from(hash, 'base64');
	const actual = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length);
	return timingSafeEqual(actual, expected);
}

export function validate(username: string, password: string): string | null {
	if (!/^[\w.-]{2,32}$/.test(username)) return 'Username: 2–32 letters, numbers, . _ or -';
	if (password.length < 6) return 'Password must be at least 6 characters';
	return null;
}

export async function register(username: string, password: string): Promise<User> {
	const err = validate(username, password);
	if (err) throw new Error(err);
	if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new Error('That username is taken');
	const r = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, await hashPassword(password), Date.now());
	return { id: Number(r.lastInsertRowid), username };
}

export async function login(username: string, password: string): Promise<User> {
	const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as
		| { id: number; username: string; password_hash: string }
		| undefined;
	// Hash anyway when the user doesn't exist so timing doesn't reveal valid usernames.
	const ok = row ? await verifyPassword(password, row.password_hash) : (await hashPassword(password), false);
	if (!row || !ok) throw new Error('Wrong username or password');
	return { id: row.id, username: row.username };
}

export function createSession(userId: number) {
	const token = randomBytes(32).toString('base64url');
	const expires = Date.now() + SESSION_DAYS * 86_400_000;
	db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
	return { token, expires: new Date(expires) };
}

export function userForSession(token: string | undefined): User | null {
	if (!token) return null;
	const row = db
		.prepare('SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
		.get(token) as { id: number; username: string; expires_at: number } | undefined;
	if (!row) return null;
	if (row.expires_at < Date.now()) {
		db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
		return null;
	}
	return { id: row.id, username: row.username };
}

export function deleteSession(token: string | undefined) {
	if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function hasUsers() {
	return !!db.prepare('SELECT 1 FROM users LIMIT 1').get();
}
