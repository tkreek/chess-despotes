import pgnParser from '@mliebelt/pgn-parser';
import { START_FEN, epd, play } from './util';

/**
 * Opening library format
 * ----------------------
 * A library is plain PGN. Each game in the file is a "chapter". Variations (RAV) and
 * {comments} are fully supported, so a Lichess study export works as-is.
 * Optional headers (first chapter wins):
 *   [Library "Name"]        – library name (falls back to StudyName, then file name)
 *   [Side "white"|"black"]  – the side you are learning (falls back to Orientation)
 *   [Description "…"]       – shown on the library card
 *   [Event "…"]             – chapter name (falls back to ChapterName)
 *   [FEN "…"]               – optional custom start position for a chapter
 * Lichess-style [%cal Ge2e4,Rd1h5] arrows and [%csl Gd5] square highlights in comments are drawn on the board.
 */

/** An arrow (orig→dest) or a highlighted square (orig only), from PGN [%cal]/[%csl] annotations. */
export interface Shape {
	orig: string;
	dest?: string;
	brush: 'green' | 'red' | 'blue' | 'yellow';
}

export interface TreeNode {
	fen: string;
	san?: string;
	uci?: string;
	comment?: string;
	shapes?: Shape[];
	children: TreeNode[];
	parent?: TreeNode;
}

export interface Edge {
	san: string;
	uci: string;
	fen: string;
	comment?: string;
	/** Annotation shapes for the position after this move */
	shapes?: Shape[];
}

export interface Chapter {
	name: string;
	root: TreeNode;
}

export interface Library {
	id: string;
	name: string;
	side: 'white' | 'black';
	description: string;
	source: 'builtin' | 'user';
	chapters: Chapter[];
	/** epd -> repertoire moves from that position (merged over all chapters; handles transpositions) */
	graph: Map<string, Edge[]>;
	positions: number;
	errors: string[];
}

interface Diag {
	comment?: string;
	colorArrows?: string[];
	colorFields?: string[];
}

interface PgnMove {
	notation: { notation: string };
	commentAfter?: string;
	commentMove?: string;
	commentDiag?: Diag | null;
	variations?: PgnMove[][];
}

const BRUSH: Record<string, Shape['brush']> = { G: 'green', R: 'red', B: 'blue', Y: 'yellow' };

function shapesOf(d: Diag | null | undefined): Shape[] | undefined {
	if (!d) return undefined;
	const out: Shape[] = [];
	for (const a of d.colorArrows ?? []) {
		const m = a.match(/^([GRBY])([a-h][1-8])([a-h][1-8])$/);
		if (m) out.push({ brush: BRUSH[m[1]], orig: m[2], dest: m[3] });
	}
	for (const f of d.colorFields ?? []) {
		const m = f.match(/^([GRBY])([a-h][1-8])$/);
		if (m) out.push({ brush: BRUSH[m[1]], orig: m[2] });
	}
	return out.length ? out : undefined;
}

/** Comment text without leftover [%…] commands. */
function cleanComment(c: string | null | undefined) {
	const t = c?.replace(/\[%[^\]]*\]/g, '').trim();
	return t || undefined;
}

export function parseLibrary(pgn: string, id: string, fallbackName: string, source: Library['source']): Library {
	const games = pgnParser.parse(pgn.replace(/^﻿/, ''), { startRule: 'games' }) as unknown as {
		tags?: Record<string, string>;
		moves: PgnMove[];
		gameComment?: Diag | null;
	}[];
	const errors: string[] = [];
	const tags = games[0]?.tags ?? {};
	const sideTag = (tags.Side ?? tags.Orientation ?? 'white').toLowerCase();
	const lib: Library = {
		id,
		name: tags.Library ?? tags.StudyName ?? fallbackName,
		side: sideTag.startsWith('b') ? 'black' : 'white',
		description: tags.Description ?? '',
		source,
		chapters: [],
		graph: new Map(),
		positions: 0,
		errors
	};

	const addEdge = (from: string, e: Edge) => {
		const k = epd(from);
		const list = lib.graph.get(k) ?? [];
		const existing = list.find((x) => x.uci === e.uci);
		if (!existing) list.push(e);
		else {
			if (e.comment && !existing.comment) existing.comment = e.comment;
			if (e.shapes && !existing.shapes) existing.shapes = e.shapes;
		}
		lib.graph.set(k, list);
	};

	const walk = (moves: PgnMove[], parent: TreeNode, chapter: string) => {
		let cur = parent;
		for (const m of moves) {
			for (const v of m.variations ?? []) walk(v, cur, chapter);
			const p = play(cur.fen, m.notation.notation);
			if (!p) {
				errors.push(`${chapter}: illegal move ${m.notation.notation}`);
				return;
			}
			let node = cur.children.find((c) => c.uci === p.uci);
			const comment = cleanComment(m.commentAfter ?? m.commentDiag?.comment);
			const shapes = shapesOf(m.commentDiag);
			if (!node) {
				node = { fen: p.fen, san: p.san, uci: p.uci, comment, shapes, children: [], parent: cur };
				cur.children.push(node);
			} else {
				node.comment ??= comment;
				node.shapes ??= shapes;
			}
			addEdge(cur.fen, { san: p.san, uci: p.uci, fen: p.fen, comment: node.comment, shapes: node.shapes });
			cur = node;
		}
	};

	games.forEach((g, i) => {
		const name = g.tags?.ChapterName ?? g.tags?.Event ?? `Chapter ${i + 1}`;
		const root: TreeNode = { fen: g.tags?.FEN ?? START_FEN, children: [], comment: cleanComment(g.gameComment?.comment), shapes: shapesOf(g.gameComment) };
		walk(g.moves, root, name);
		lib.chapters.push({ name: name === '?' ? `Chapter ${i + 1}` : name, root });
	});
	lib.positions = lib.graph.size;
	return lib;
}

/** Positions where the learner is to move and has a repertoire answer — these become flashcards. */
export function learnerPositions(lib: Library): string[] {
	const sideChar = lib.side === 'white' ? 'w' : 'b';
	return [...lib.graph.keys()].filter((k) => k.split(' ')[1] === sideChar);
}

const builtinFiles = import.meta.glob('/openings/*.pgn', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function builtinLibraries(): Library[] {
	return Object.entries(builtinFiles).map(([path, text]) => {
		const file = path.split('/').pop()!.replace(/\.pgn$/, '');
		return parseLibrary(text, `builtin-${file}`, file.replace(/[-_]/g, ' '), 'builtin');
	});
}
