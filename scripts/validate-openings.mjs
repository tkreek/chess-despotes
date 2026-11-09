// Validates every openings/*.pgn file: every move (including variations) must be legal.
// Usage: node scripts/validate-openings.mjs
import { readFileSync, readdirSync } from 'node:fs';
import pgnParser from '@mliebelt/pgn-parser';
import { Chess } from 'chess.js';

let errors = 0;
function walk(moves, fen, file, chapter) {
	let cur = fen;
	for (const m of moves) {
		for (const v of m.variations ?? []) walk(v, cur, file, chapter);
		const c = new Chess(cur);
		try { c.move(m.notation.notation); } catch { console.error(`✗ ${file} [${chapter}]: illegal ${m.notation.notation} in ${cur}`); errors++; return; }
		cur = c.fen();
	}
}
for (const f of readdirSync('openings').filter((f) => f.endsWith('.pgn'))) {
	const games = pgnParser.parse(readFileSync(`openings/${f}`, 'utf8'), { startRule: 'games' });
	for (const g of games) walk(g.moves, g.tags?.FEN ?? new Chess().fen(), f, g.tags?.Event);
	console.log(`${f}: ${games.length} chapters`);
}
process.exit(errors ? 1 : 0);
