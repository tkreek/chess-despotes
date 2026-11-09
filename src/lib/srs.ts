import { db, type Card } from './db';
import { epd } from './chess/util';
import { learnerPositions, parseLibrary, builtinLibraries, type Library } from './chess/library';

const DAY = 86_400_000;

export const cardKey = (libId: string, fen: string) => `${libId}|${epd(fen)}`;

/** SM-2 style update. */
export function grade(card: Card | undefined, key: string, lib: string, correct: boolean): Card {
	const now = Date.now();
	const c: Card = card ?? { key, lib, due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, last: 0 };
	if (correct) {
		c.interval = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.interval * c.ease);
		c.ease = Math.min(3, c.ease + 0.05);
		c.reps++;
	} else {
		c.interval = 0;
		c.ease = Math.max(1.3, c.ease - 0.2);
		c.reps = 0;
		c.lapses++;
	}
	c.due = now + (correct ? c.interval * DAY : 60_000);
	c.last = now;
	return c;
}

export async function cardsFor(libId: string): Promise<Map<string, Card>> {
	const all = await (await db()).getAllFromIndex('cards', 'lib', libId);
	return new Map(all.map((c) => [c.key, c]));
}

export async function saveCard(c: Card) {
	await (await db()).put('cards', JSON.parse(JSON.stringify(c)));
}

export interface LibProgress {
	total: number;
	learned: number; // reps >= 2
	seen: number;
	due: number;
}

export function progressOf(lib: Library, cards: Map<string, Card>): LibProgress {
	const now = Date.now();
	const keys = learnerPositions(lib).map((k) => `${lib.id}|${k}`);
	let learned = 0, seen = 0, due = 0;
	for (const k of keys) {
		const c = cards.get(k);
		if (!c) continue;
		seen++;
		if (c.reps >= 2) learned++;
		if (c.due <= now) due++;
	}
	return { total: keys.length, learned, seen, due };
}

/** All libraries: built-in files from /openings plus ones imported in the app. */
export async function allLibraries(): Promise<Library[]> {
	const user = await (await db()).getAll('libraries');
	return [
		...builtinLibraries(),
		...user.map((u) => parseLibrary(u.pgn, u.id, u.name, 'user'))
	];
}
