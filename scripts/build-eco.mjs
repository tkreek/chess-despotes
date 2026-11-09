// Builds static/data/eco.json: { "<epd>": ["ECO", "Opening name"] }
// and static/data/openings.json: [["ECO", "Opening name", "1. e4 c6 …", "e2e4 c7c6 …"], …] for the checklist.
// Source: https://github.com/lichess-org/chess-openings (CC0). Usage: node scripts/build-eco.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Chess } from 'chess.js';

const out = {};
const catalog = [];
for (const f of ['a', 'b', 'c', 'd', 'e']) {
	const rows = readFileSync(`data/eco-${f}.tsv`, 'utf8').trim().split('\n').slice(1);
	for (const row of rows) {
		const [eco, name, pgn] = row.split('\t');
		const c = new Chess();
		c.loadPgn(pgn);
		const epd = c.fen().split(' ').slice(0, 4).join(' ');
		out[epd] = [eco, name];
		catalog.push([eco, name, pgn, c.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? '')).join(' ')]);
	}
}
mkdirSync('static/data', { recursive: true });
writeFileSync('static/data/eco.json', JSON.stringify(out));
writeFileSync('static/data/openings.json', JSON.stringify(catalog));
console.log(`eco.json: ${Object.keys(out).length} positions; openings.json: ${catalog.length} lines`);
