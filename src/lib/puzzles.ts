import { kvGet, kvSet } from './db';

export interface Puzzle {
	id: string;
	fen: string;
	moves: string[];
	rating: number;
	themes: string[];
	openings: string[];
}

let cache: Promise<Puzzle[]> | null = null;
export function loadPuzzles(): Promise<Puzzle[]> {
	cache ??= fetch('/puzzles/puzzles.json')
		.then((r) => r.json() as Promise<[string, string, string, number, string, string][]>)
		.then((rows) =>
			rows.map(([id, fen, moves, rating, themes, openings]) => ({
				id,
				fen,
				moves: moves.split(' '),
				rating,
				themes: themes.split(' ').filter(Boolean),
				openings: openings.split(' ').filter(Boolean)
			}))
		);
	return cache;
}

export interface PuzzleStats {
	rating: number;
	played: number;
	solved: number;
	streak: number;
	best: number;
	history: { id: string; win: boolean; rating: number; at: number }[];
	seen: string[];
}

export const defaultStats = (): PuzzleStats => ({ rating: 1200, played: 0, solved: 0, streak: 0, best: 0, history: [], seen: [] });
export const loadStats = () => kvGet<PuzzleStats>('puzzleStats', defaultStats());
export const saveStats = (s: PuzzleStats) => kvSet('puzzleStats', s);

export function pickPuzzle(all: Puzzle[], rating: number, seen: Set<string>, theme: string | null): Puzzle | null {
	const pool = all.filter((p) => !seen.has(p.id) && (!theme || p.themes.includes(theme)));
	for (let w = 100; w <= 3000; w += 100) {
		const cands = pool.filter((p) => p.rating >= rating - w && p.rating <= rating + w + 50);
		if (cands.length >= 3 || w >= 3000) return cands[Math.floor(Math.random() * cands.length)] ?? null;
	}
	return null;
}

export function themeLabel(t: string) {
	return t.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/(\d)/, ' $1');
}

export const THEMES = [
	'mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'sacrifice',
	'deflection', 'attraction', 'backRankMate', 'endgame', 'middlegame', 'opening', 'promotion', 'defensiveMove', 'quietMove'
];
