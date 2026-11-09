/**
 * Lichess study search + export. Both endpoints allow CORS, so this runs straight from the browser
 * (dev, preview or a static build). Please keep requests one-at-a-time per Lichess API etiquette.
 */
const LICHESS = 'https://lichess.org';

export interface StudyHit {
	id: string;
	name: string;
	likes: number | null;
	owner: string;
	updatedAt: number;
	topics: string[];
}

export interface StudyPage {
	results: StudyHit[];
	page: number;
	nbPages: number;
	nbResults: number;
}

export type StudyOrder = 'popular' | 'hot' | 'newest' | 'updated';

interface RawStudy {
	id: string;
	name: string;
	likes?: number;
	updatedAt?: number;
	owner?: { name: string };
	topics?: string[];
}

const toHit = (r: RawStudy): StudyHit => ({
	id: r.id,
	name: r.name,
	likes: r.likes ?? null,
	owner: r.owner?.name ?? '',
	updatedAt: r.updatedAt ?? 0,
	topics: r.topics ?? []
});

/** Extract a study id from a lichess URL or a bare 8-character id. */
export function studyIdFrom(input: string): string | null {
	const t = input.trim();
	const m = t.match(/lichess\.org\/study\/([A-Za-z0-9]{8})/);
	if (m) return m[1];
	return /^[A-Za-z0-9]{8}$/.test(t) && /\d|[A-Z]/.test(t) ? t : null;
}

/**
 * Search public studies. `@username` lists that user's public studies instead.
 * An empty query returns the most popular studies overall.
 */
export async function searchStudies(q: string, order: StudyOrder, page = 1): Promise<StudyPage> {
	const query = q.trim();
	const user = query.match(/^@([\w-]{2,30})$/)?.[1];
	if (user) {
		const r = await fetch(`${LICHESS}/api/study/by/${encodeURIComponent(user)}`, { headers: { Accept: 'application/x-ndjson' } });
		if (!r.ok) throw new Error(r.status === 404 ? `No user “${user}”` : `Lichess returned ${r.status}`);
		const results = (await r.text()).split('\n').filter(Boolean).map((l) => toHit({ ...JSON.parse(l), owner: { name: user } }));
		return { results, page: 1, nbPages: 1, nbResults: results.length };
	}
	// Search pages go through the local dev/preview proxy (see vite.config.ts) because they aren't CORS-enabled.
	const url = query
		? `/lichess-study/search?q=${encodeURIComponent(query)}&order=${order}&page=${page}`
		: `/lichess-study/all/${order}?page=${page}`;
	let r: Response;
	try {
		r = await fetch(url, { headers: { Accept: 'application/json' } });
	} catch {
		throw new Error('Could not reach Lichess search.');
	}
	if (r.status === 404 || !r.headers.get('content-type')?.includes('json'))
		throw new Error('Study search needs the app running via npm run dev / preview. You can still paste a study URL or search @username.');
	if (r.status === 429) throw new Error('Lichess rate limit hit — wait a minute and try again.');
	if (!r.ok) throw new Error(`Lichess returned ${r.status}`);
	const { paginator: p } = (await r.json()) as {
		paginator: { currentPage: number; nbPages: number; nbResults: number; currentPageResults: RawStudy[] };
	};
	return { results: p.currentPageResults.map(toHit), page: p.currentPage, nbPages: p.nbPages, nbResults: p.nbResults };
}

/** Full study PGN with variations, comments and arrows/highlights. */
export async function fetchStudyPgn(id: string): Promise<string> {
	const r = await fetch(`${LICHESS}/api/study/${id}.pgn?comments=true&variations=true&clocks=false&orientation=true`);
	if (r.status === 404) throw new Error('Study not found (it may be private).');
	if (r.status === 429) throw new Error('Lichess rate limit hit — wait a minute and try again.');
	if (!r.ok) throw new Error(`Lichess returned ${r.status}`);
	return r.text();
}

/** Split a multi-game PGN into games (one per study chapter). */
export function splitPgn(pgn: string): string[] {
	return pgn
		.replace(/\r\n/g, '\n')
		.split(/\n\s*\n(?=\[Event )/)
		.map((g) => g.trim())
		.filter(Boolean);
}

/** Guess which side a study teaches, from Orientation headers or the name. */
export function guessSide(name: string, games: string[]): 'white' | 'black' {
	let w = 0, b = 0;
	for (const g of games) {
		const o = g.match(/^\[Orientation "(\w+)"\]/m)?.[1];
		if (o === 'black') b++;
		else if (o === 'white') w++;
	}
	if (b !== w) return b > w ? 'black' : 'white';
	return /defen[cs]e|for black|as black|black repertoire|sicilian|caro|french|pirc|scandinavian|king'?s indian|grünfeld|grunfeld|nimzo|dutch|benoni|slav\b/i.test(name) ? 'black' : 'white';
}

/** Readable library name: drop emoji the terminal font can't render. */
export const cleanName = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

/** Build the stored library PGN from selected chapters, stamping our headers onto the first one. */
export function buildLibraryPgn(games: string[], name: string, side: 'white' | 'black', source: string): string {
	const esc = (v: string) => v.replace(/"/g, "'");
	return games
		.map((g, i) => (i === 0 ? `[Library "${esc(name)}"]\n[Side "${side}"]\n[Source "${source}"]\n${g}` : g))
		.join('\n\n');
}
