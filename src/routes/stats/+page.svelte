<script lang="ts">
	import { onMount } from 'svelte';
	import LineChart from '#lib/components/charts/LineChart.svelte';
	import ColumnChart from '#lib/components/charts/ColumnChart.svelte';
	import { allLibraries, cardsFor, progressOf } from '#lib/srs.ts';
	import { loadCatalog, loadChecked } from '#lib/checklist.ts';
	import { themeLabel } from '#lib/puzzles.ts';
	import type { Stats } from '#lib/stats-types.ts';

	let s = $state.raw<Stats | null>(null);
	let reps = $state.raw<{ id: string; name: string; side: string; learned: number; total: number }[]>([]);
	let checklist = $state.raw<{ family: string; done: number; total: number }[]>([]);
	let checkedTotal = $state(0);

	onMount(async () => {
		const [stats, libs, catalog, checked] = await Promise.all([
			fetch('/api/stats').then((r) => r.json() as Promise<Stats>),
			allLibraries(),
			loadCatalog(),
			loadChecked()
		]);
		s = stats;
		reps = await Promise.all(
			libs.map(async (l) => {
				const p = progressOf(l, await cardsFor(l.id));
				return { id: l.id, name: l.name, side: l.side, learned: p.learned, total: p.total };
			})
		);
		checkedTotal = checked.size;
		checklist = catalog
			.map((f) => ({ family: f.label, done: f.all.filter((k) => checked.has(k)).length, total: f.all.length }))
			.filter((f) => f.done > 0)
			.sort((a, b) => b.done / b.total - a.done / a.total || b.done - a.done)
			.slice(0, 10);
	});

	const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
	const mins = (sec: number) => (sec < 60 ? `${Math.round(sec)}s` : sec < 3600 ? `${Math.round(sec / 60)}m` : `${(sec / 3600).toFixed(1)}h`);
	const date = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
	const ago = (t: number) => {
		const d = Math.floor((Date.now() - t) / 86_400_000);
		return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
	};

	const ratingPoints = $derived(
		(s?.puzzles.history ?? []).map((h, i) => ({
			x: i,
			y: h.rating,
			label: `#${i + 1} · ${date(h.at)}`,
			detail: `${h.win ? 'solved' : 'failed'} a ${h.puzzleRating} puzzle`
		}))
	);
	const dayCols = $derived(
		(s?.drills.days ?? []).map((d, i, all) => ({
			label: new Date(d.day + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
			value: d.seconds / 60,
			detail: d.n ? `${d.n} moves · ${pct(d.correct, d.n)}% correct` : 'no drilling',
			tick: i === all.length - 1 ? 'today' : (all.length - 1 - i) % 7 === 0 ? `-${all.length - 1 - i}d` : undefined
		}))
	);
	const themes = $derived.by(() => {
		const t = (s?.puzzles.themes ?? []).filter((x) => x.n >= 3).map((x) => ({ ...x, rate: x.wins / x.n }));
		const sorted = [...t].sort((a, b) => b.rate - a.rate || b.n - a.n);
		return { strong: sorted.slice(0, 6), weak: sorted.slice(-6).reverse().filter((x) => !sorted.slice(0, 6).includes(x)) };
	});
	const openings = $derived(
		(s?.games.openings ?? [])
			.map((o) => ({ ...o, score: (o.wins + o.draws / 2) / o.n }))
			.sort((a, b) => b.score - a.score || b.n - a.n)
	);
	const drillLibs = $derived(
		(s?.drills.libs ?? []).map((l) => ({ ...l, rep: reps.find((r) => r.id === l.lib) })).sort((a, b) => b.correct / b.n - a.correct / a.n)
	);
	const gameTotals = $derived(openings.reduce((a, o) => ({ w: a.w + o.wins, d: a.d + o.draws, l: a.l + o.losses }), { w: 0, d: 0, l: 0 }));
</script>

<header>
	<h1>Stats</h1>
	<p class="muted">Your progress across puzzles, drills, games and the checklist.</p>
</header>

{#if !s}
	<p class="muted">Loading…</p>
{:else}
	<section class="tiles">
		<div class="panel tile">
			<h3>puzzle rating</h3>
			<b>{s.puzzles.rating ?? '—'}</b>
			<span class="faint">{s.puzzles.peak ? `peak ${s.puzzles.peak}` : 'no puzzles yet'}</span>
		</div>
		<div class="panel tile">
			<h3>puzzles solved</h3>
			<b>{pct(s.puzzles.wins, s.puzzles.total)}%</b>
			<span class="faint">{s.puzzles.wins}/{s.puzzles.total} · avg {mins(s.puzzles.avgSeconds)}</span>
		</div>
		<div class="panel tile">
			<h3>drill time</h3>
			<b>{mins(s.drills.weekSeconds)}</b>
			<span class="faint">this week · {mins(s.drills.seconds)} total</span>
		</div>
		<div class="panel tile">
			<h3>drill accuracy</h3>
			<b>{pct(s.drills.correct, s.drills.total)}%</b>
			<span class="faint">{s.drills.total} moves · {s.drills.streakDays}-day streak</span>
		</div>
		<div class="panel tile">
			<h3>games</h3>
			<b>{gameTotals.w}<small>W</small> {gameTotals.d}<small>D</small> {gameTotals.l}<small>L</small></b>
			<span class="faint">{s.games.withColor} with your color set · {s.games.total} saved</span>
		</div>
		<div class="panel tile">
			<h3>checklist</h3>
			<b>{checkedTotal}</b>
			<span class="faint">named lines ticked</span>
		</div>
	</section>

	<section class="grid2">
		<div class="panel">
			<h3>puzzle rating over time</h3>
			{#if ratingPoints.length > 1}
				<LineChart points={ratingPoints} />
			{:else}
				<p class="empty faint">Solve a few puzzles to see your rating trend.</p>
			{/if}
		</div>
		<div class="panel">
			<h3>drill minutes · last 30 days</h3>
			{#if s.drills.total}
				<ColumnChart cols={dayCols} format={(v) => (v === 0 ? '0' : v < 1 ? `${Math.max(1, Math.round(v * 60))}s` : v >= 10 ? `${Math.round(v)}m` : `${v.toFixed(1)}m`)} />
				<p class="faint small">Think time per answered move, capped at 60s so idle time isn't counted.</p>
			{:else}
				<p class="empty faint">Drill an opening to start tracking time.</p>
			{/if}
		</div>
	</section>

	<section class="grid2">
		<div class="panel">
			<h3>strongest openings · your games</h3>
			{#if openings.length}
				<table>
					<thead><tr><th>opening</th><th>as</th><th class="n">games</th><th class="n">W/D/L</th><th class="n">score</th><th class="n">acc.</th></tr></thead>
					<tbody>
						{#each openings as o (o.family + o.color)}
							<tr>
								<td>{o.family}</td>
								<td class="faint">{o.color}</td>
								<td class="n">{o.n}</td>
								<td class="n"><span class="good">{o.wins}</span>/<span class="faint">{o.draws}</span>/<span class="bad">{o.losses}</span></td>
								<td class="n"><span class="meter mini"><span style="width:{o.score * 100}%"></span></span> {Math.round(o.score * 100)}%</td>
								<td class="n">{o.accuracy !== null ? `${o.accuracy}%` : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="faint small">Score = wins + ½ draws. Accuracy comes from games you've run a review on.</p>
			{:else}
				<p class="empty faint">Play the engine or import games (with “I played” set) to see results by opening.</p>
			{/if}
		</div>
		<div class="panel">
			<h3>strongest repertoires · drills</h3>
			{#if drillLibs.length}
				<table>
					<thead><tr><th>library</th><th class="n">accuracy</th><th class="n">moves</th><th class="n">time</th><th class="n">learned</th><th class="n">last</th></tr></thead>
					<tbody>
						{#each drillLibs as l (l.lib)}
							<tr>
								<td><a href="/openings/{l.lib}">{l.name}</a></td>
								<td class="n"><span class="meter mini"><span style="width:{pct(l.correct, l.n)}%"></span></span> {pct(l.correct, l.n)}%</td>
								<td class="n">{l.n}</td>
								<td class="n">{mins(l.seconds)}</td>
								<td class="n">{l.rep ? `${l.rep.learned}/${l.rep.total}` : '—'}</td>
								<td class="n faint">{ago(l.last)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty faint">No drills yet.</p>
			{/if}
		</div>
	</section>

	<section>
		<div class="panel">
			<h3>vision training · personal bests</h3>
			{#if s.vision.length}
				<table>
					<thead><tr><th>drill</th><th>settings</th><th class="n">sessions</th><th class="n">best score</th><th class="n">best accuracy</th><th class="n">fastest avg</th><th class="n">last</th></tr></thead>
					<tbody>
						{#each s.vision as v (v.mode + v.variant)}
							<tr>
								<td>{({ coords: 'coordinates', rush: 'coordinate rush', colors: 'square color', blindfold: 'blindfold game' } as Record<string, string>)[v.mode]}</td>
								<td class="faint">{v.variant}</td>
								<td class="n">{v.sessions}</td>
								<td class="n">{v.mode === 'blindfold' ? '—' : v.bestHits}</td>
								<td class="n"><span class="meter mini"><span style="width:{v.bestAccuracy * 100}%"></span></span> {Math.round(v.bestAccuracy * 100)}%</td>
								<td class="n">{v.bestAvgMs !== null ? `${(v.bestAvgMs / 1000).toFixed(2)}s` : '—'}</td>
								<td class="n faint">{ago(v.lastAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="faint small">Blindfold accuracy = share of your typed moves that were legal on the first try.</p>
			{:else}
				<p class="empty faint">Try the <a href="/vision">vision drills</a> to track coordinate speed and blindfold play.</p>
			{/if}
		</div>
	</section>

	<section class="grid2">
		<div class="panel">
			<h3>puzzle themes</h3>
			{#if themes.strong.length}
				<div class="themes">
					<div>
						<p class="sub">strongest</p>
						{#each themes.strong as t (t.theme)}
							<div class="hbar"><span class="name">{themeLabel(t.theme)}</span><span class="track"><span style="width:{t.rate * 100}%"></span></span><span class="v">{Math.round(t.rate * 100)}%</span><span class="faint c">{t.n}</span></div>
						{/each}
					</div>
					{#if themes.weak.length}
						<div>
							<p class="sub">needs work</p>
							{#each themes.weak as t (t.theme)}
								<div class="hbar"><span class="name">{themeLabel(t.theme)}</span><span class="track"><span style="width:{t.rate * 100}%"></span></span><span class="v">{Math.round(t.rate * 100)}%</span><span class="faint c">{t.n}</span></div>
							{/each}
						</div>
					{/if}
				</div>
				<p class="faint small">Solve rate per theme (themes with 3+ attempts; right column = attempts).</p>
			{:else}
				<p class="empty faint">Themes show up after a few puzzles.</p>
			{/if}
		</div>
		<div class="panel">
			<h3>checklist · most complete</h3>
			{#if checklist.length}
				{#each checklist as c (c.family)}
					<div class="hbar"><span class="name">{c.family}</span><span class="track"><span style="width:{(c.done / c.total) * 100}%"></span></span><span class="v">{c.done}/{c.total}</span></div>
				{/each}
			{:else}
				<p class="empty faint">Tick lines on the <a href="/checklist">checklist</a> to see them here.</p>
			{/if}
		</div>
	</section>
{/if}

<style>
	header { margin-bottom: 18px; }
	header p { margin-top: 4px; }
	section { margin-bottom: 22px; }
	.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 14px; }
	.tile { display: flex; flex-direction: column; gap: 4px; padding-top: 16px; }
	.tile b { font-size: 1.8em; line-height: 1.15; }
	.tile small { font-size: 0.5em; color: var(--muted); margin: 0 4px 0 1px; }
	.tile .faint { font-size: 0.82em; }
	.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px; align-items: start; }
	.grid2 .panel { padding-top: 18px; min-width: 0; }
	.empty { padding: 24px 0; text-align: center; }
	.small { font-size: 0.82em; margin-top: 8px; }
	table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
	th { text-align: left; color: var(--muted); font-weight: 400; border-bottom: 1px solid var(--frame); padding: 4px 6px; }
	td { padding: 4px 6px; border-bottom: 1px dashed color-mix(in srgb, var(--text) 10%, transparent); }
	.n { text-align: right; white-space: nowrap; }
	td a:hover { color: var(--gold); }
	.good { color: var(--good); }
	.bad { color: var(--bad); }
	.meter.mini { display: inline-block; width: 6ch; height: 7px; vertical-align: middle; margin-right: 4px; }
	.themes { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
	.sub { color: var(--muted); font-size: 0.85em; margin-bottom: 4px; }
	.hbar { display: grid; grid-template-columns: minmax(0, 1fr) 10ch 5ch auto; align-items: center; gap: 8px; font-size: 0.88em; padding: 2px 0; }
	.hbar .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hbar .track { height: 8px; background: color-mix(in srgb, var(--text) 8%, transparent); }
	.hbar .track span { display: block; height: 100%; background: var(--gold); }
	.hbar .v { text-align: right; }
	.hbar .c { font-size: 0.85em; }
	@media (max-width: 700px) { .themes { grid-template-columns: 1fr; } .grid2 { grid-template-columns: 1fr; } }
</style>
