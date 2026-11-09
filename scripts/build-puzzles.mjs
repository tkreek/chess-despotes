// Builds static/puzzles/puzzles.json from a lichess puzzle CSV (CC0).
// Full DB: https://database.lichess.org/lichess_db_puzzle.csv.zst
//   curl -L https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | head -n 400000 > data/puzzles.csv
// Usage: node scripts/build-puzzles.mjs [csv=data/lichess-puzzles-sample.csv] [perBand=150]
// Output rows: [id, fen, moves, rating, themes, openingTags]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const csv = process.argv[2] ?? 'data/lichess-puzzles-sample.csv';
const perBand = Number(process.argv[3] ?? 150);
const lines = readFileSync(csv, 'utf8').trim().split('\n');
const header = lines.shift().split(',');
const col = (n) => header.indexOf(n);
const [iId, iFen, iMoves, iRating, iRd, iPop, iPlays, iThemes, iOpen] = [
	'PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity', 'NbPlays', 'Themes', 'OpeningTags'
].map(col);

const bands = new Map();
for (const line of lines) {
	const r = line.split(',');
	if (+r[iPop] < 85 || +r[iPlays] < 300 || +r[iRd] > 90) continue;
	const rating = +r[iRating];
	const band = Math.floor(rating / 100);
	const list = bands.get(band) ?? [];
	if (list.length >= perBand) continue;
	list.push([r[iId], r[iFen], r[iMoves], rating, r[iThemes], r[iOpen] ?? '']);
	bands.set(band, list);
}
const all = [...bands.values()].flat().sort((a, b) => a[3] - b[3]);
mkdirSync('static/puzzles', { recursive: true });
writeFileSync('static/puzzles/puzzles.json', JSON.stringify(all));
console.log(`puzzles.json: ${all.length} puzzles, ratings ${all[0][3]}–${all.at(-1)[3]}`);
