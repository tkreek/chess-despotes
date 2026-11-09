import pgnParser from '@mliebelt/pgn-parser';
import { Chess } from 'chess.js';
import { db, type GameReview, type SavedGame } from './db';
import { Engine } from './chess/engine';
import { START_FEN, epd, play, winPct, uid } from './chess/util';
import { loadEco, openingName } from './chess/eco';
import type { Library } from './chess/library';

export interface Ply {
	san: string;
	uci: string;
	fen: string; // position after the move
}

export interface ParsedGame {
	headers: Record<string, string>;
	startFen: string;
	plies: Ply[];
}

function tagValue(v: unknown): string | undefined {
	if (typeof v === 'string') return v;
	if (v && typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value);
	return undefined;
}

/** Parse one or more games from PGN text (main line only). */
export function parsePgnGames(text: string): ParsedGame[] {
	const games = pgnParser.parse(text.replace(/^﻿/, '').trim(), { startRule: 'games' }) as unknown as {
		tags?: Record<string, unknown>;
		moves: { notation: { notation: string } }[];
	}[];
	return games.map((g) => {
		const headers: Record<string, string> = {};
		for (const [k, v] of Object.entries(g.tags ?? {})) {
			const s = tagValue(v);
			if (s !== undefined && k !== 'messages') headers[k] = s;
		}
		const startFen = headers.FEN ?? START_FEN;
		const plies: Ply[] = [];
		let cur = startFen;
		for (const m of g.moves) {
			const p = play(cur, m.notation.notation);
			if (!p) break;
			plies.push({ san: p.san, uci: p.uci, fen: p.fen });
			cur = p.fen;
		}
		return { headers, startFen, plies };
	});
}

export function toPgn(headers: Record<string, string>, startFen: string, plies: { san: string }[]): string {
	const h: Record<string, string> = { Event: '?', Site: 'Chess Despotes', Date: '????.??.??', White: '?', Black: '?', Result: '*', ...headers };
	if (startFen !== START_FEN) {
		h.FEN = startFen;
		h.SetUp = '1';
	}
	const [, side, , , , n] = startFen.split(' ');
	let num = +n;
	const parts: string[] = [];
	plies.forEach((p, i) => {
		const white = (i % 2 === 0) === (side === 'w');
		if (white) parts.push(`${num}.`);
		else if (i === 0) parts.push(`${num}...`);
		parts.push(p.san);
		if (!white) num++;
	});
	parts.push(h.Result);
	const head = Object.entries(h).map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join('\n');
	return `${head}\n\n${parts.join(' ').replace(/(.{1,78})(\s|$)/g, '$1\n').trim()}\n`;
}

export async function saveGame(g: ParsedGame, opts: { myColor: SavedGame['myColor']; source: SavedGame['source'] }): Promise<SavedGame> {
	await loadEco();
	const name = openingName([g.startFen, ...g.plies.map((p) => p.fen)]);
	const rec: SavedGame = {
		id: uid(),
		pgn: toPgn(g.headers, g.startFen, g.plies),
		white: g.headers.White ?? '?',
		black: g.headers.Black ?? '?',
		result: g.headers.Result ?? '*',
		date: g.headers.Date ?? '',
		myColor: opts.myColor,
		source: opts.source,
		opening: name ? `${name.eco} ${name.name}` : undefined,
		plies: g.plies.length,
		createdAt: Date.now()
	};
	await (await db()).put('games', rec);
	return rec;
}

export async function updateGame(g: SavedGame) {
	await (await db()).put('games', JSON.parse(JSON.stringify(g)));
}

const MATE = 100000;

/** Full-game review with the lightweight engine. */
export async function reviewGame(game: ParsedGame, depth: number, onProgress: (done: number, total: number) => void, signal?: { cancelled: boolean }): Promise<GameReview | null> {
	const eco = await fetch('/data/eco.json').then((r) => r.json() as Promise<Record<string, unknown>>);
	const engine = new Engine();
	const fens = [game.startFen, ...game.plies.map((p) => p.fen)];
	const evals: number[] = [];
	const best: string[] = [];
	try {
		for (const [i, fen] of fens.entries()) {
			if (signal?.cancelled) return null;
			const c = new Chess(fen);
			if (c.isCheckmate()) {
				evals.push(c.turn() === 'w' ? -MATE : MATE);
				best.push('');
			} else if (c.isDraw()) {
				evals.push(0);
				best.push('');
			} else {
				const r = await engine.search(fen, { depth, multiPv: 1 });
				evals.push(r.lines[0]?.cp ?? 0);
				best.push(r.bestmove);
			}
			onProgress(i + 1, fens.length);
		}
	} finally {
		engine.destroy();
	}

	const classes: GameReview['classes'] = [];
	const acc = { white: [] as number[], black: [] as number[] };
	let inBook = true;
	game.plies.forEach((p, i) => {
		const whiteMoved = fens[i].split(' ')[1] === 'w';
		const before = winPct(clampCp(evals[i]));
		const after = winPct(clampCp(evals[i + 1]));
		const loss = whiteMoved ? before - after : after - before;
		const a = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669));
		(whiteMoved ? acc.white : acc.black).push(a);
		inBook = inBook && epd(p.fen) in eco;
		if (inBook) classes.push('book');
		else if (p.uci === best[i]) classes.push(null);
		else classes.push(loss >= 30 ? 'blunder' : loss >= 20 ? 'mistake' : loss >= 10 ? 'inaccuracy' : null);
	});
	const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 100);
	return { evals, best, classes, accuracy: { white: avg(acc.white), black: avg(acc.black) }, depth };
}

const clampCp = (cp: number) => Math.max(-1500, Math.min(1500, cp));

export interface RepertoireCheck {
	lib: Library;
	ply: number; // index of the deviating move (0-based) or plies.length if never left
	byMe: boolean | null;
	played: string | null;
	expected: string[];
}

/** Find where a game left your opening repertoire. */
export function checkRepertoire(game: ParsedGame, libs: Library[], myColor: 'white' | 'black' | null): RepertoireCheck | null {
	let bestHit: RepertoireCheck | null = null;
	const fens = [game.startFen, ...game.plies.map((p) => p.fen)];
	for (const lib of libs) {
		if (myColor && lib.side !== myColor) continue;
		let i = 0;
		for (; i < game.plies.length; i++) {
			const edges = lib.graph.get(epd(fens[i]));
			if (!edges || !edges.some((e) => e.uci === game.plies[i].uci)) break;
		}
		if (i === 0 && !lib.graph.has(epd(fens[0]))) continue;
		const edges = lib.graph.get(epd(fens[i])) ?? [];
		const mover = fens[i].split(' ')[1] === 'w' ? 'white' : 'black';
		const hit: RepertoireCheck = {
			lib,
			ply: i,
			byMe: i >= game.plies.length ? null : myColor ? mover === myColor : mover === lib.side,
			played: game.plies[i]?.san ?? null,
			expected: edges.map((e) => e.san)
		};
		if (!bestHit || hit.ply > bestHit.ply) bestHit = hit;
	}
	return bestHit && bestHit.ply > 0 ? bestHit : null;
}
