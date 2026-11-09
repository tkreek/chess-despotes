import { db } from './db.ts';
import type { Stats } from '../stats-types.ts';

export type { Stats };

const DAY = 86_400_000;
const dayKey = (t: number) => {
	const d = new Date(t);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function statsFor(user: number, days = 30): Stats {
	// ---- puzzles ----
	const pa = db
		.prepare('SELECT puzzle_rating, themes, win, used_hint, rating_after, seconds, at FROM puzzle_attempts WHERE user_id = ? ORDER BY at')
		.all(user) as { puzzle_rating: number; themes: string; win: number; used_hint: number; rating_after: number; seconds: number; at: number }[];
	const themeMap = new Map<string, { n: number; wins: number }>();
	for (const a of pa)
		for (const t of a.themes.split(' ').filter(Boolean)) {
			const s = themeMap.get(t) ?? { n: 0, wins: 0 };
			s.n++;
			s.wins += a.win;
			themeMap.set(t, s);
		}
	const puzzles: Stats['puzzles'] = {
		total: pa.length,
		wins: pa.reduce((s, a) => s + a.win, 0),
		hints: pa.reduce((s, a) => s + a.used_hint, 0),
		avgSeconds: pa.length ? pa.reduce((s, a) => s + a.seconds, 0) / pa.length : 0,
		rating: pa.at(-1)?.rating_after ?? null,
		peak: pa.length ? Math.max(...pa.map((a) => a.rating_after)) : null,
		history: pa.map((a) => ({ at: a.at, rating: a.rating_after, win: !!a.win, puzzleRating: a.puzzle_rating })),
		themes: [...themeMap].map(([theme, s]) => ({ theme, ...s }))
	};

	// ---- drills ----
	const de = db.prepare('SELECT correct, seconds, at FROM drill_events WHERE user_id = ?').all(user) as { correct: number; seconds: number; at: number }[];
	const byDay = new Map<string, { seconds: number; n: number; correct: number }>();
	for (const e of de) {
		const k = dayKey(e.at);
		const d = byDay.get(k) ?? { seconds: 0, n: 0, correct: 0 };
		d.seconds += e.seconds;
		d.n++;
		d.correct += e.correct;
		byDay.set(k, d);
	}
	const dayList: Stats['drills']['days'] = [];
	for (let i = days - 1; i >= 0; i--) {
		const k = dayKey(Date.now() - i * DAY);
		dayList.push({ day: k, ...(byDay.get(k) ?? { seconds: 0, n: 0, correct: 0 }) });
	}
	let streakDays = 0;
	for (let i = 0; ; i++) {
		const has = byDay.has(dayKey(Date.now() - i * DAY));
		if (has) streakDays++;
		else if (i > 0) break; // today may still be empty
	}
	const libs = db
		.prepare(
			`SELECT lib, max(lib_name) name, count(*) n, sum(correct) correct, sum(seconds) seconds, max(at) last
			 FROM drill_events WHERE user_id = ? GROUP BY lib ORDER BY n DESC`
		)
		.all(user) as Stats['drills']['libs'];
	const drills: Stats['drills'] = {
		total: de.length,
		correct: de.reduce((s, e) => s + e.correct, 0),
		seconds: de.reduce((s, e) => s + e.seconds, 0),
		weekSeconds: de.filter((e) => e.at >= Date.now() - 7 * DAY).reduce((s, e) => s + e.seconds, 0),
		streakDays,
		days: dayList,
		libs
	};

	// ---- games: results by opening family, from your side of the board ----
	const gs = db.prepare('SELECT data FROM games WHERE user_id = ?').all(user) as { data: string }[];
	const fam = new Map<string, Stats['games']['openings'][number] & { accs: number[] }>();
	let withColor = 0;
	for (const { data } of gs) {
		const g = JSON.parse(data) as { opening?: string; myColor?: 'white' | 'black' | null; result: string; review?: { accuracy: Record<string, number> } };
		if (!g.myColor || !['1-0', '0-1', '1/2-1/2'].includes(g.result)) continue;
		withColor++;
		const family = (g.opening ?? 'Unknown opening').replace(/^[A-E]\d\d\s+/, '').split(':')[0].trim();
		const key = `${family}|${g.myColor}`;
		const f = fam.get(key) ?? { family, color: g.myColor, n: 0, wins: 0, draws: 0, losses: 0, accuracy: null, accs: [] };
		f.n++;
		if (g.result === '1/2-1/2') f.draws++;
		else if ((g.result === '1-0') === (g.myColor === 'white')) f.wins++;
		else f.losses++;
		const acc = g.review?.accuracy?.[g.myColor];
		if (typeof acc === 'number') f.accs.push(acc);
		fam.set(key, f);
	}
	const openings = [...fam.values()].map(({ accs, ...f }) => ({ ...f, accuracy: accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null }));
	// ---- vision drills: best per mode + settings (blindfold games grouped per level) ----
	const vs = db
		.prepare('SELECT mode, variant, hits, misses, avg_ms, at FROM vision_sessions WHERE user_id = ? ORDER BY at')
		.all(user) as { mode: Stats['vision'][number]['mode']; variant: string; hits: number; misses: number; avg_ms: number | null; at: number }[];
	const vmap = new Map<string, Stats['vision'][number]>();
	for (const v of vs) {
		const variant = v.mode === 'blindfold' ? v.variant.split(' · ')[0] : v.variant;
		const key = `${v.mode}|${variant}`;
		const acc = v.hits + v.misses ? v.hits / (v.hits + v.misses) : 0;
		const cur = vmap.get(key) ?? { mode: v.mode, variant, sessions: 0, bestHits: 0, bestAccuracy: 0, bestAvgMs: null, lastAt: 0 };
		cur.sessions++;
		cur.bestHits = Math.max(cur.bestHits, v.hits);
		cur.bestAccuracy = Math.max(cur.bestAccuracy, acc);
		if (v.avg_ms !== null && (cur.bestAvgMs === null || v.avg_ms < cur.bestAvgMs)) cur.bestAvgMs = v.avg_ms;
		cur.lastAt = v.at;
		vmap.set(key, cur);
	}
	const vision = [...vmap.values()].sort((a, b) => b.lastAt - a.lastAt);

	return { puzzles, drills, games: { total: gs.length, withColor, openings }, vision };
}
