<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import type { DrawShape } from 'chessground/draw';
	import type { Key } from 'chessground/types';
	import Board from '#lib/components/Board.svelte';
	import EngineLines from '#lib/components/EngineLines.svelte';
	import EvalBar from '#lib/components/EvalBar.svelte';
	import MoveList from '#lib/components/MoveList.svelte';
	import EvalGraph from '#lib/components/EvalGraph.svelte';
	import { db, type SavedGame } from '#lib/db.ts';
	import { parsePgnGames, reviewGame, updateGame, saveGame, checkRepertoire, type Ply, type RepertoireCheck } from '#lib/games.ts';
	import { START_FEN, play, uciToSan, gameStatus } from '#lib/chess/util.ts';
	import { loadEco, openingName } from '#lib/chess/eco.ts';
	import type { EngineLine } from '#lib/chess/engine.ts';
	import { allLibraries } from '#lib/srs.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { Chess } from 'chess.js';

	let game = $state<SavedGame | null>(null);
	let headers = $state<Record<string, string>>({});
	let startFen = $state(START_FEN);
	let main = $state<Ply[]>([]);
	let line = $state<Ply[]>([]);
	let ply = $state(0);
	let orientation = $state<'white' | 'black'>('white');
	let engineOn = $state(true);
	let lines = $state<EngineLine[]>([]);
	let ecoReady = $state(false);
	let progress = $state<number | null>(null);
	let cancel = { cancelled: false };
	let rep = $state.raw<RepertoireCheck | null>(null);
	let loadText = $state('');
	let loadError = $state('');
	let savedId = $state<string | null>(null);

	const fen = $derived(ply ? line[ply - 1].fen : startFen);
	const branchAt = $derived.by(() => {
		let i = 0;
		while (i < line.length && i < main.length && line[i].uci === main[i].uci) i++;
		return i;
	});
	const onMain = $derived(ply <= branchAt);
	const review = $derived(game?.review ?? null);
	const opening = $derived(ecoReady ? openingName([startFen, ...line.slice(0, ply).map((p) => p.fen)]) : null);
	const lastMove = $derived<[string, string] | null>(ply ? [line[ply - 1].uci.slice(0, 2), line[ply - 1].uci.slice(2, 4)] : null);
	const startsWithBlack = $derived(startFen.split(' ')[1] === 'b');
	const startNum = $derived(+startFen.split(' ')[5] || 1);
	const moveCls = $derived(line.map((p, i) => ({ san: p.san, cls: review && i < branchAt ? review.classes[i] : null })));
	const status = $derived(gameStatus(fen));

	const curClass = $derived(review && onMain && ply ? review.classes[ply - 1] : null);
	const bestBefore = $derived(review && onMain && ply && curClass && curClass !== 'book' ? review.best[ply - 1] : null);

	const shapes = $derived<DrawShape[]>(
		engineOn && lines[0]?.pv[0]
			? [{ orig: lines[0].pv[0].slice(0, 2) as Key, dest: lines[0].pv[0].slice(2, 4) as Key, brush: 'paleBlue' }]
			: []
	);

	onMount(async () => {
		loadEco().then(() => (ecoReady = true));
		const q = page.url.searchParams;
		const id = q.get('game');
		if (id) {
			const g = await (await db()).get('games', id);
			if (g) {
				game = g;
				savedId = g.id;
				const parsed = parsePgnGames(g.pgn)[0];
				setGame(parsed.headers, parsed.startFen, parsed.plies);
				if (g.myColor) orientation = g.myColor;
				const libs = await allLibraries();
				rep = checkRepertoire(parsed, libs, g.myColor);
			}
		} else if (q.get('fen')) {
			const f = q.get('fen')!;
			const plies: Ply[] = [];
			let cur = f;
			for (const u of (q.get('moves') ?? '').split(/[ +]/).filter(Boolean)) {
				const p = play(cur, u);
				if (!p) break;
				plies.push(p);
				cur = p.fen;
			}
			setGame({}, f, plies);
			ply = Math.min(+(q.get('ply') ?? 0), plies.length);
			// Puzzle links start one move before the solver's turn; plain FENs show the side to move.
			orientation = (plies.length ? plies[0].fen : f).split(' ')[1] === 'w' ? 'white' : 'black';
		}
	});
	onDestroy(() => (cancel.cancelled = true));

	function setGame(h: Record<string, string>, f: string, plies: Ply[]) {
		headers = h;
		startFen = f;
		main = plies;
		line = [...plies];
		ply = 0;
	}

	function loadInput() {
		loadError = '';
		const t = loadText.trim();
		if (!t) return;
		if (/^([rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+ [wb]/.test(t)) {
			try {
				new Chess(t);
			} catch {
				return void (loadError = 'Invalid FEN');
			}
			setGame({}, t, []);
			game = null;
			savedId = null;
			return;
		}
		try {
			const g = parsePgnGames(t)[0];
			if (!g?.plies.length) throw new Error('No moves found');
			game = null;
			savedId = null;
			setGame(g.headers, g.startFen, g.plies);
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Could not parse PGN';
		}
	}

	function onmove(uci: string) {
		const p = play(fen, uci);
		if (!p) return;
		if (line[ply]?.uci === p.uci) {
			ply++;
			return;
		}
		line = [...line.slice(0, ply), p];
		ply++;
	}

	function backToMain() {
		line = [...main];
		ply = Math.min(ply, branchAt);
	}

	async function runReview() {
		if (!main.length) return;
		cancel = { cancelled: false };
		progress = 0;
		const r = await reviewGame({ headers, startFen, plies: main }, settings.reviewDepth, (d, t) => (progress = d / t), cancel);
		progress = null;
		if (!r) return;
		if (!game) await saveCurrent();
		game!.review = r;
		game = { ...game! };
		await updateGame(game);
	}

	async function saveCurrent() {
		const g = await saveGame({ headers: { ...headers }, startFen, plies: main.length ? main : line }, { myColor: null, source: 'import' });
		game = g;
		savedId = g.id;
		main = [...(main.length ? main : line)];
	}

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if (e.key === 'ArrowLeft') ply = Math.max(0, ply - 1);
		else if (e.key === 'ArrowRight') ply = Math.min(line.length, ply + 1);
		else if (e.key === 'Home') ply = 0;
		else if (e.key === 'End') ply = line.length;
		else if (e.key === 'f') orientation = orientation === 'white' ? 'black' : 'white';
		else return;
		e.preventDefault();
	}

	const counts = $derived.by(() => {
		const c = { white: { inaccuracy: 0, mistake: 0, blunder: 0 }, black: { inaccuracy: 0, mistake: 0, blunder: 0 } };
		review?.classes.forEach((k, i) => {
			if (!k || k === 'book') return;
			const whiteMoved = (i % 2 === 0) !== startsWithBlack;
			c[whiteMoved ? 'white' : 'black'][k]++;
		});
		return c;
	});

	const moveLabel = (i: number) => {
		const n = Math.floor((i + (startsWithBlack ? 1 : 0)) / 2) + startNum;
		return (i + (startsWithBlack ? 1 : 0)) % 2 === 0 ? `${n}.` : `${n}…`;
	};
</script>

<svelte:window onkeydown={onKey} />

<header class="row wrap">
	<div>
		<h1>{game ? `${game.white} vs ${game.black}` : 'Analysis board'}</h1>
		<p class="muted">
			{#if game}{game.result.replace('1/2-1/2', '½–½')} · {game.date || new Date(game.createdAt).toLocaleDateString()}{:else}Play moves, paste a PGN or FEN, or open a game from My Games.{/if}
		</p>
	</div>
</header>

<div class="study">
	<div class="board-col">
		<div class="board-row">
			<div class="evalbar"><EvalBar line={engineOn ? (lines[0] ?? null) : null} {orientation} /></div>
			<div class="b"><Board {fen} {orientation} {lastMove} {shapes} {onmove} /></div>
		</div>
		<div class="row controls">
			<button onclick={() => (ply = 0)} title="Start (Home)">«</button>
			<button onclick={() => (ply = Math.max(0, ply - 1))} title="Back (←)">‹</button>
			<button onclick={() => (ply = Math.min(line.length, ply + 1))} title="Forward (→)">›</button>
			<button onclick={() => (ply = line.length)} title="End (End)">»</button>
			<span class="spacer"></span>
			<button onclick={() => (orientation = orientation === 'white' ? 'black' : 'white')} title="Flip (f)">⇅ flip</button>
		</div>
		{#if review}
			<div class="graph"><EvalGraph evals={review.evals} classes={review.classes} ply={Math.min(ply, branchAt)} onselect={(p) => (line = [...main], (ply = p))} /></div>
		{/if}
	</div>

	<aside class="stack">
		<div class="panel stack">
			<div class="opening">
				{#if opening}<span class="eco mono">{opening.eco}</span> {opening.name}{:else}<span class="faint">{status ?? 'Starting position'}</span>{/if}
			</div>
			{#if status && opening}<span class="faint">{status}</span>{/if}
			{#if !onMain && main.length}
				<div class="row variation">
					<span>Exploring a variation</span><span class="spacer"></span>
					<button class="sm" onclick={backToMain}>Back to game</button>
				</div>
			{/if}
			{#if curClass && curClass !== 'book'}
				<p class="verdict {curClass}">
					{moveLabel(ply - 1)}{line[ply - 1].san} is {curClass === 'inaccuracy' ? 'an' : 'a'} <b>{curClass}</b>.
					{#if bestBefore}Best was <button class="sm link" onclick={() => { ply--; onmove(bestBefore!); }}>{uciToSan(ply > 1 ? line[ply - 2].fen : startFen, bestBefore)}</button>{/if}
				</p>
			{/if}
		</div>

		<EngineLines {fen} bind:enabled={engineOn} bind:lines onplay={onmove} />

		<div class="panel"><MoveList moves={moveCls} {ply} startMoveNumber={startNum} {startsWithBlack} onselect={(p) => (ply = p)} /></div>

		{#if rep}
			<div class="panel stack rep">
				<h3>Repertoire check</h3>
				{#if rep.byMe === null}
					<p>This game stayed inside <b>{rep.lib.name}</b> all the way. 📖</p>
				{:else}
					<p>
						Followed <b>{rep.lib.name}</b> until {moveLabel(rep.ply)}
						{#if rep.byMe}
							— <span class="bad">you</span> played <b>{rep.played}</b>; your repertoire says <b class="good">{rep.expected.join(' / ')}</b>.
						{:else}
							— your opponent left the book with <b>{rep.played}</b>{rep.expected.length ? ` (prepared: ${rep.expected.join(' / ')})` : ''}.
						{/if}
					</p>
				{/if}
				<div class="row">
					{#if rep.byMe !== null}<button class="sm" onclick={() => (line = [...main], (ply = rep!.ply))}>Show position</button>{/if}
					<a class="btn sm" href="/openings/{rep.lib.id}?mode=drill">Drill {rep.lib.name}</a>
				</div>
			</div>
		{/if}

		<div class="panel stack">
			<div class="row">
				<h3>Game review</h3>
				<span class="spacer"></span>
				{#if progress === null}
					<button class="sm {review ? '' : 'primary'}" onclick={runReview} disabled={!main.length}>{review ? 'Re-run' : 'Review game'}</button>
				{:else}
					<button class="sm" onclick={() => (cancel.cancelled = true)}>Cancel</button>
				{/if}
			</div>
			{#if progress !== null}
				<div class="meter"><span style="width:{progress * 100}%"></span></div>
				<p class="faint small">Analyzing every position at depth {settings.reviewDepth}…</p>
			{:else if review}
				<div class="acc">
					{#each ['white', 'black'] as const as side (side)}
						<div>
							<span class="who"><i class="dot {side}"></i>{side === 'white' ? (game?.white ?? 'White') : (game?.black ?? 'Black')}</span>
							<b>{review.accuracy[side]}%</b>
							<span class="faint small">
								<span class="c-inacc">{counts[side].inaccuracy} ?!</span> · <span class="c-mist">{counts[side].mistake} ?</span> · <span class="c-blun">{counts[side].blunder} ??</span>
							</span>
						</div>
					{/each}
				</div>
			{:else if !main.length}
				<p class="faint small">Load or play a game to review it.</p>
			{:else}
				<p class="faint small">Runs the engine over every move to find inaccuracies, mistakes and blunders.</p>
			{/if}
		</div>

		{#if !game && line.length}
			<button onclick={async () => { main = [...line]; await saveCurrent(); }}>Save to My Games</button>
		{/if}
		{#if savedId && !game}<p class="faint small">Saved.</p>{/if}

		{#if !game}
			<div class="panel stack">
				<h3>Load PGN or FEN</h3>
				<textarea rows="4" bind:value={loadText} placeholder="Paste a PGN or FEN"></textarea>
				{#if loadError}<p class="bad small">{loadError}</p>{/if}
				<button onclick={loadInput} disabled={!loadText.trim()}>Load</button>
			</div>
		{/if}
	</aside>
</div>

<style>
	header { margin-bottom: 20px; }
	header p { margin-top: 4px; }
	.board-row { display: flex; gap: 10px; }
	.evalbar { flex: none; }
	.b { flex: 1; min-width: 0; }
	.controls { margin-top: 12px; padding-left: 32px; }
	.graph { margin-top: 14px; padding-left: 32px; }
	.opening { font-size: 1em; }
	.eco { font-size: 0.88em; color: var(--gold-2); background: color-mix(in srgb, var(--gold) 10%, transparent); padding: 2px 6px; }
	.variation { font-size: 0.88em; color: var(--blue); }
	.verdict { font-size: 14px; }
	.verdict.inaccuracy b { color: var(--warn); }
	.verdict.mistake b { color: var(--orange); }
	.verdict.blunder b { color: var(--bad); }
	.link { padding: 1px 8px; color: var(--good); font-weight: 600; }
	.rep p { font-size: 14px; line-height: 1.55; }
	.good { color: var(--good); }
	.bad { color: var(--bad); }
	.small { font-size: 0.88em; }
	.meter { height: 6px; background: var(--panel-2); overflow: hidden; }
	.meter span { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-2)); transition: width 0.2s; }
	.acc { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.acc div { display: flex; flex-direction: column; background: var(--bg-2); padding: 10px 12px; }
	.acc b { font-size: 1.9em; }
	.who { display: flex; align-items: center; gap: 6px; font-size: 0.88em; color: var(--muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.dot { width: 10px; height: 10px; border: 1px solid #555; display: inline-block; flex: none; }
	.dot.white { background: #f1ede4; }
	.dot.black { background: #111; }
	.c-inacc { color: var(--warn); }
	.c-mist { color: var(--orange); }
	.c-blun { color: var(--bad); }
</style>
