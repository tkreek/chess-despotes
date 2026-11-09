<script lang="ts">
	import { onMount } from 'svelte';
	import { allLibraries, cardsFor, progressOf } from '#lib/srs.ts';
	import { loadStats } from '#lib/puzzles.ts';
	import { db } from '#lib/db.ts';
	import { loadChecked } from '#lib/checklist.ts';
	import Board from '#lib/components/Board.svelte';
	import Banner from '#lib/components/Banner.svelte';

	let due = $state(0);
	let learned = $state(0);
	let total = $state(0);
	let libs = $state(0);
	let rating = $state<number | null>(null);
	let games = $state(0);
	let ticked = $state(0);

	onMount(async () => {
		const ls = await allLibraries();
		libs = ls.length;
		for (const l of ls) {
			const p = progressOf(l, await cardsFor(l.id));
			due += p.due;
			learned += p.learned;
			total += p.total;
		}
		rating = (await loadStats()).rating;
		games = await (await db()).count('games');
		ticked = (await loadChecked()).size;
	});

	const heroFen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 1 5';
</script>

<section class="hero">
	<div class="copy">
		<Banner text="CHESS" cell={9} />
		<Banner text="DESPOTES" cell={9} />
		<p class="prompt"><span class="faint">$</span> master your openings. rule the board.<span class="cursor">&nbsp;</span></p>
		<p class="muted">
			Build repertoires from plain PGN, drill them with spaced repetition, sharpen tactics, and review your own games with a
			fast, lightweight engine. Everything stays local.
		</p>
		<div class="actions">
			<a class="btn primary" href="/openings"><kbd>2</kbd> {due ? `review ${due} due moves` : 'study openings'}</a>
			<a class="btn" href="/puzzles"><kbd>4</kbd> solve puzzles</a>
			<a class="btn" href="/play"><kbd>5</kbd> play the engine</a>
		</div>
	</div>
	<div class="hero-board"><Board fen={heroFen} movable="none" lastMove={['c2', 'c3']} /></div>
</section>

<section class="cards">
	<a class="panel card" href="/openings">
		<h3>openings</h3>
		<b>{learned}<small>/{total} learned</small></b>
		<div class="meter"><span style="width:{total ? (learned / total) * 100 : 0}%"></span></div>
		<span class="faint">{libs} libraries · {due} due now</span>
	</a>
	<a class="panel card" href="/checklist">
		<h3>checklist</h3>
		<b>{ticked}</b>
		<span class="faint">named lines ticked off</span>
	</a>
	<a class="panel card" href="/puzzles">
		<h3>puzzle rating</h3>
		<b>{rating ?? '—'}</b>
		<span class="faint">3,000+ lichess puzzles</span>
	</a>
	<a class="panel card" href="/games">
		<h3>my games</h3>
		<b>{games}</b>
		<span class="faint">saved for review</span>
	</a>
	<a class="panel card" href="/analysis">
		<h3>engine</h3>
		<b class="sm">stockfish 19 lite</b>
		<span class="faint">1.8 MB · runs offline</span>
	</a>
</section>

<style>
	.hero { display: grid; grid-template-columns: 1.2fr 1fr; gap: 48px; align-items: center; max-width: 1180px; margin: 8px auto 36px; }
	.copy { display: flex; flex-direction: column; gap: 14px; }
	.prompt { font-size: 1.15em; margin-top: 10px; }
	.copy > p.muted { max-width: 540px; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
	kbd { font: inherit; font-size: 0.8em; opacity: 0.7; }
	.hero-board { width: min(100%, 420px); justify-self: center; }
	.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 18px; max-width: 1180px; margin: 0 auto; }
	.card { display: flex; flex-direction: column; gap: 8px; padding-top: 18px; }
	.card:hover { border-color: var(--gold); }
	.card b { font-size: 2em; font-weight: 700; line-height: 1.1; }
	.card b.sm { font-size: 1.15em; }
	.card small { font-size: 0.45em; color: var(--muted); font-weight: 400; margin-left: 4px; }
	@media (max-width: 900px) { .hero { grid-template-columns: 1fr; } }
</style>
