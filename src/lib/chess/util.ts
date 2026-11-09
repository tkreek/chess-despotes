import { Chess, SQUARES, type Square } from 'chess.js';
import type { Key } from 'chessground/types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Position key that ignores move counters (for transpositions / lookups). */
export const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export const turnOf = (fen: string): 'white' | 'black' => (fen.split(' ')[1] === 'w' ? 'white' : 'black');

export function legalDests(fen: string): Map<Key, Key[]> {
	const chess = new Chess(fen);
	const dests = new Map<Key, Key[]>();
	for (const s of SQUARES) {
		const ms = chess.moves({ square: s as Square, verbose: true });
		if (ms.length) dests.set(s as Key, ms.map((m) => m.to as Key));
	}
	return dests;
}

export interface Played {
	san: string;
	uci: string;
	fen: string;
	from: Key;
	to: Key;
}

/** Apply a move given as SAN or UCI; returns null if illegal. */
export function play(fen: string, move: string): Played | null {
	const chess = new Chess(fen);
	try {
		const isUci = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move);
		const m = isUci
			? chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] ?? 'q' })
			: chess.move(move);
		return { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fen: chess.fen(), from: m.from as Key, to: m.to as Key };
	} catch {
		return null;
	}
}

export function isCheck(fen: string) {
	return new Chess(fen).inCheck();
}

export function gameStatus(fen: string): string | null {
	const c = new Chess(fen);
	if (c.isCheckmate()) return c.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
	if (c.isStalemate()) return 'Draw by stalemate';
	if (c.isInsufficientMaterial()) return 'Draw — insufficient material';
	if (c.isDraw()) return 'Draw';
	return null;
}

/** Lichess win% model from centipawns (white POV). */
export function winPct(cp: number) {
	return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function uciToSan(fen: string, uci: string) {
	return play(fen, uci)?.san ?? uci;
}

/** Convert a UCI PV to SAN with move numbers. */
export function pvToSan(fen: string, pv: string[], max = 10): string {
	let cur = fen;
	const parts: string[] = [];
	for (const [i, u] of pv.slice(0, max).entries()) {
		const [, side, , , , n] = cur.split(' ');
		const p = play(cur, u);
		if (!p) break;
		if (side === 'w') parts.push(`${n}.`);
		else if (i === 0) parts.push(`${n}…`);
		parts.push(p.san);
		cur = p.fen;
	}
	return parts.join(' ');
}

export function uid() {
	return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}
