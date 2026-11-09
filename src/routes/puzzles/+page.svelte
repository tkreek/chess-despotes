<script lang="ts">
	import { onMount } from 'svelte';
	import type { Key } from 'chessground/types';
	import type { DrawShape } from 'chessground/draw';
	import Board from '#lib/components/Board.svelte';
	import { loadPuzzles, loadStats, saveStats, pickPuzzle, themeLabel, THEMES, defaultStats, type Puzzle, type PuzzleStats } from '#lib/puzzles.ts';
	import { play, turnOf, type Played } from '#lib/chess/util.ts';
	import { Chess } from 'chess.js';
	import { track } from '#lib/events.ts';

	let all: Puzzle[] = [];
	let loading = $state(true);
	let stats = $state<PuzzleStats>(defaultStats());
	let theme = $state<string | null>(null);

	let puzzle = $state.raw<Puzzle | null>(null);
	let fen = $state('');
	let lastMove = $state<[string, string] | null>(null);
	let step = $state(0); // index into puzzle.moves of the next expected move
	let phase = $state<'loading' | 'opponent' | 'mine' | 'solved' | 'failed'>('loading');
	let failed = $state(false); // made at least one mistake
	let usedHint = $state(false);
	let hintSq = $state<Key | null>(null);
	let delta = $state<number | null>(null);
	let highlights = $state<Map<Key, string>>(new Map());
	let orientation = $state<'white' | 'black'>('white');
	let solutionShapes = $state<DrawShape[]>([]);
	let startedAt = 0;

	onMount(async () => {
		[all, stats] = await Promise.all([loadPuzzles(), loadStats()]);
		loading = false;
		next();
	});

	function apply(uci: string): Played {
		const p = play(fen, uci)!;
		fen = p.fen;
		lastMove = [p.from, p.to];
		return p;
	}

	function next() {
		const p = pickPuzzle(all, stats.rating, new Set(stats.seen), theme);
		puzzle = p;
		if (!p) return;
		fen = p.fen;
		lastMove = null;
		step = 0;
		failed = usedHint = false;
		hintSq = null;
		delta = null;
		highlights = new Map();
		solutionShapes = [];
		// The puzzle FEN is before the opponent's move; the solver plays the other side.
		orientation = turnOf(p.fen) === 'white' ? 'black' : 'white';
		phase = 'opponent';
		setTimeout(() => {
			apply(p.moves[0]);
			step = 1;
			phase = 'mine';
			startedAt = performance.now();
		}, 650);
	}

	function finish(win: boolean) {
		if (!puzzle) return;
		const expected = 1 / (1 + 10 ** ((puzzle.rating - stats.rating) / 400));
		const k = stats.played < 20 ? 40 : 20;
		let d = Math.round(k * ((win ? 1 : 0) - expected));
		if (win && usedHint) d = Math.round(d / 2);
		stats.rating = Math.max(400, stats.rating + d);
		stats.played++;
		if (win) {
			stats.solved++;
			stats.streak++;
			stats.best = Math.max(stats.best, stats.streak);
		} else stats.streak = 0;
		stats.history = [{ id: puzzle.id, win, rating: puzzle.rating, at: Date.now() }, ...stats.history].slice(0, 40);
		stats.seen = [...stats.seen, puzzle.id].slice(-2500);
		delta = d;
		saveStats(stats);
		track({
			type: 'puzzle',
			puzzleId: puzzle.id,
			puzzleRating: puzzle.rating,
			themes: puzzle.themes.join(' '),
			win,
			usedHint,
			ratingAfter: stats.rating,
			seconds: startedAt ? (performance.now() - startedAt) / 1000 : 0
		});
	}

	function onmove(uci: string) {
		if (phase !== 'mine' || !puzzle) return;
		const expected = puzzle.moves[step];
		const isLast = step === puzzle.moves.length - 1;
		const mates = (() => {
			const c = new Chess(fen);
			try {
				c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
				return c.isCheckmate();
			} catch {
				return false;
			}
		})();
		hintSq = null;
		if (uci === expected || (expected.length === 5 && uci === expected) || (uci.length === 4 && expected === uci + 'q') || (isLast && mates)) {
			const p = apply(uci.length === 4 && expected.startsWith(uci) ? expected : uci);
			highlights = new Map([[p.to, 'good']]);
			step++;
			if (step >= puzzle.moves.length) {
				phase = 'solved';
				if (!failed) finish(true);
				return;
			}
			phase = 'opponent';
			setTimeout(() => {
				apply(puzzle!.moves[step]);
				step++;
				highlights = new Map();
				phase = 'mine';
			}, 380);
		} else {
			const bad = play(fen, uci);
			highlights = bad ? new Map([[bad.to, 'bad']]) : new Map();
			if (!failed) {
				failed = true;
				finish(false);
			}
		}
	}

	function hint() {
		if (!puzzle || phase !== 'mine') return;
		usedHint = true;
		hintSq = puzzle.moves[step].slice(0, 2) as Key;
	}

	async function showSolution() {
		if (!puzzle || phase === 'solved') return;
		if (!failed) {
			failed = true;
			finish(false);
		}
		phase = 'opponent';
		while (step < puzzle.moves.length) {
			const m = puzzle.moves[step];
			solutionShapes = [{ orig: m.slice(0, 2) as Key, dest: m.slice(2, 4) as Key, brush: 'green' }];
			await new Promise((r) => setTimeout(r, 650));
			apply(m);
			step++;
		}
		solutionShapes = [];
		phase = 'solved';
	}

	const shapes = $derived<DrawShape[]>([...solutionShapes, ...(hintSq ? [{ orig: hintSq, brush: 'blue' } as DrawShape] : [])]);
	const toMove = $derived(fen ? turnOf(fen) : 'white');
	const analysisHref = $derived(puzzle ? `/analysis?fen=${encodeURIComponent(puzzle.fen)}&moves=${puzzle.moves.join('+')}&ply=1` : '/analysis');
</script>

<header class="row">
	<div>
		<h1>Puzzles</h1>
		<p class="muted">Curated tactics from the lichess puzzle database, matched to your rating.</p>
	</div>
</header>

{#if loading}
	<p class="muted">Loading puzzles…</p>
{:else}
	<div class="study">
		<div class="board-col">
			<Board {fen} {orientation} {lastMove} {shapes} {highlights} movable={phase === 'mine' ? orientation : 'none'} {onmove} />
		</div>
		<aside class="stack">
			<div class="panel rating">
				<div>
					<span class="k">Your rating</span>
					<b>{stats.rating}</b>
					{#if delta !== null}<span class="delta {delta >= 0 ? 'up' : 'down'}">{delta >= 0 ? '+' : ''}{delta}</span>{/if}
				</div>
				<div class="mini">
					<span><b>{stats.streak}</b> streak</span>
					<span><b>{stats.played ? Math.round((stats.solved / stats.played) * 100) : 0}%</b> solved</span>
					<span><b>{stats.played}</b> played</span>
				</div>
			</div>

			<div class="panel stack">
				<div class="status {phase}">
					{#if phase === 'mine'}
						<span class="dot {toMove}"></span>
						<div>
							<b>{failed ? 'Keep trying' : 'Your turn'}</b>
							<span>Find the best move for {toMove}.</span>
						</div>
					{:else if phase === 'opponent'}
						<span class="dot {toMove}"></span>
						<div><b>…</b><span>Opponent is moving</span></div>
					{:else if phase === 'solved'}
						<span class="icon" class:fail={failed}>{failed ? '✗' : '✓'}</span>
						<div>
							<b>{failed ? 'Puzzle failed' : 'Solved!'}</b>
							<span>Puzzle rated {puzzle?.rating}</span>
						</div>
					{/if}
				</div>
				<div class="row wrap">
					{#if phase === 'solved'}
						<button class="primary" onclick={next}>Next puzzle →</button>
						<a class="btn" href={analysisHref}>Analyze</a>
					{:else}
						<button onclick={hint} disabled={phase !== 'mine'}>Hint</button>
						<button onclick={showSolution} disabled={phase !== 'mine'}>View solution</button>
						<span class="spacer"></span>
						<button class="ghost" onclick={next}>Skip</button>
					{/if}
				</div>
				{#if puzzle && phase === 'solved'}
					<div class="row wrap">
						{#each puzzle.themes as t (t)}<span class="tag">{themeLabel(t)}</span>{/each}
					</div>
					<a class="faint small" href="https://lichess.org/training/{puzzle.id}" target="_blank" rel="noreferrer">lichess puzzle #{puzzle.id} ↗</a>
				{/if}
			</div>

			<div class="panel stack">
				<h3>Theme</h3>
				<div class="row wrap">
					<button class="sm" class:active={!theme} onclick={() => ((theme = null), next())}>Mixed</button>
					{#each THEMES as t (t)}
						<button class="sm" class:active={theme === t} onclick={() => ((theme = t), next())}>{themeLabel(t)}</button>
					{/each}
				</div>
			</div>

			{#if stats.history.length}
				<div class="panel">
					<h3>Recent</h3>
					<div class="history">
						{#each stats.history.slice(0, 20) as h (h.at)}
							<a class="h {h.win ? 'win' : 'loss'}" href="https://lichess.org/training/{h.id}" target="_blank" rel="noreferrer" title={String(h.rating)}>{h.rating}</a>
						{/each}
					</div>
				</div>
			{/if}
		</aside>
	</div>
{/if}

<style>
	header { margin-bottom: 20px; }
	header p { margin-top: 4px; }
	.rating { display: flex; flex-direction: column; gap: 10px; }
	.k { display: block; font-size: 0.88em; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
	.rating > div > b { font-size: 1.9em; line-height: 1.1; }
	.delta { font-weight: 600; margin-left: 8px; font-size: 1em; }
	.delta.up { color: var(--good); }
	.delta.down { color: var(--bad); }
	.mini { display: flex; gap: 16px; color: var(--muted); font-size: 0.88em; }
	.mini b { color: var(--text); font-weight: 600; }
	.status { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--line); }
	.status div { display: flex; flex-direction: column; }
	.status b { font-size: 1.2em; }
	.status span { color: var(--muted); font-size: 0.88em; }
	.dot { width: 26px; height: 26px; flex: none; border: 2px solid #555; }
	.dot.white { background: #f1ede4; }
	.dot.black { background: #111; }
	.icon { font-size: 1.2em; width: 26px; text-align: center; }
	.status.solved .icon { color: var(--good); }
	.status.solved .icon.fail { color: var(--bad); }
	.small { font-size: 0.88em; }
	.history { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
	.h { font: 500 11.5px var(--mono); padding: 3px 7px; }
	.h.win { background: color-mix(in srgb, var(--good) 15%, transparent); color: var(--good); }
	.h.loss { background: color-mix(in srgb, var(--bad) 15%, transparent); color: var(--bad); }
</style>
