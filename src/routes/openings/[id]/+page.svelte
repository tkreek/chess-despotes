<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { DrawShape } from 'chessground/draw';
	import type { Key } from 'chessground/types';
	import Board from '#lib/components/Board.svelte';
	import EngineLines from '#lib/components/EngineLines.svelte';
	import MoveList from '#lib/components/MoveList.svelte';
	import { allLibraries, cardsFor, saveCard, grade, cardKey, progressOf } from '#lib/srs.ts';
	import type { Library, Edge, TreeNode, Shape } from '#lib/chess/library.ts';
	import type { Card } from '#lib/db.ts';
	import { epd, play, START_FEN, turnOf, type Played } from '#lib/chess/util.ts';
	import { loadEco, openingName } from '#lib/chess/eco.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import { track } from '#lib/events.ts';

	let lib = $state.raw<Library | null>(null);
	let notFound = $state(false);
	let cards = $state.raw(new Map<string, Card>());
	let cardsVersion = $state(0);
	let ecoReady = $state(false);

	type Mode = 'explore' | 'drill';
	let mode = $state<Mode>(page.url.searchParams.get('mode') === 'drill' ? 'drill' : 'explore');
	let chapter = $state(-1);
	let orientation = $state<'white' | 'black'>('white');

	let line = $state<Played[]>([]);
	let ply = $state(0);

	const graph = $derived(lib ? (chapter < 0 ? lib.graph : chapterGraph(lib.chapters[chapter].root)) : new Map<string, Edge[]>());
	const rootFen = $derived(lib && chapter >= 0 ? lib.chapters[chapter].root.fen : START_FEN);
	const fen = $derived(ply ? line[ply - 1].fen : rootFen);
	const prevFen = $derived(ply > 1 ? line[ply - 2].fen : rootFen);
	const edges = $derived(graph.get(epd(fen)) ?? []);
	const lastEdge = $derived(ply ? (graph.get(epd(prevFen)) ?? []).find((e) => e.uci === line[ply - 1].uci) : undefined);
	const opening = $derived(ecoReady ? openingName([rootFen, ...line.slice(0, ply).map((p) => p.fen)]) : null);
	const progress = $derived.by(() => {
		void cardsVersion;
		return lib ? progressOf(lib, cards) : null;
	});

	function chapterGraph(root: TreeNode) {
		const g = new Map<string, Edge[]>();
		const walk = (n: TreeNode) => {
			for (const c of n.children) {
				const list = g.get(epd(n.fen)) ?? [];
				if (!list.some((e) => e.uci === c.uci)) list.push({ san: c.san!, uci: c.uci!, fen: c.fen, comment: c.comment, shapes: c.shapes });
				g.set(epd(n.fen), list);
				walk(c);
			}
		};
		walk(root);
		return g;
	}

	onMount(async () => {
		const libs = await allLibraries();
		lib = libs.find((l) => l.id === page.params.id) ?? null;
		if (!lib) return void (notFound = true);
		orientation = lib.side;
		cards = await cardsFor(lib.id);
		cardsVersion++;
		loadEco().then(() => (ecoReady = true));
		if (mode === 'drill') startDrill();
	});

	function push(uci: string) {
		const p = play(fen, uci);
		if (!p) return null;
		line = [...line.slice(0, ply), p];
		ply = line.length;
		return p;
	}

	function reset() {
		clearTimeout(oppTimer);
		line = [];
		ply = 0;
	}

	function setMode(m: Mode) {
		mode = m;
		const url = new URL(page.url.href);
		url.searchParams.set('mode', m);
		goto(url.pathname + url.search, { replace: true, shallow: true });
		reset();
		if (m === 'drill') startDrill();
	}

	function setChapter(i: number) {
		chapter = i;
		reset();
		if (mode === 'drill') startDrill();
	}

	// ---------------- Explore ----------------
	function exploreMove(uci: string) {
		push(uci);
	}

	// Study annotations ([%cal]/[%csl]) for the current position: from the move that led here, or the chapter intro.
	let showStudyShapes = $state(true);
	const studyShapes = $derived<Shape[]>((ply ? lastEdge?.shapes : chapter >= 0 ? lib?.chapters[chapter].root.shapes : undefined) ?? []);
	const nodeComment = $derived(ply ? lastEdge?.comment : chapter >= 0 ? lib?.chapters[chapter].root.comment : undefined);

	const exploreShapes = $derived.by<DrawShape[]>(() => {
		if (mode === 'drill' || !lib) return [];
		const mine = turnOf(fen) === lib.side;
		const study: DrawShape[] = showStudyShapes
			? studyShapes.map((sh) => ({ orig: sh.orig as Key, dest: sh.dest as Key | undefined, brush: sh.brush }))
			: [];
		const taken = new Set(study.map((sh) => `${sh.orig}${sh.dest ?? ''}`));
		const rep: DrawShape[] = edges
			.filter((e) => !taken.has(e.uci.slice(0, 4)))
			.map((e) => ({ orig: e.uci.slice(0, 2) as Key, dest: e.uci.slice(2, 4) as Key, brush: mine ? 'green' : 'blue', modifiers: { lineWidth: 7 } }));
		return [...rep, ...study];
	});

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
		if (e.key === 'f') orientation = orientation === 'white' ? 'black' : 'white';
		if (mode === 'drill') return;
		if (e.key === 'ArrowLeft') ply = Math.max(0, ply - 1);
		else if (e.key === 'ArrowRight') {
			if (ply < line.length) ply++;
			else if (edges[0]) push(edges[0].uci);
		} else if (e.key === 'Home') ply = 0;
		else if (e.key === 'End') ply = line.length;
		else return;
		e.preventDefault();
	}

	// ---------------- Drill ----------------
	type DrillStatus = 'idle' | 'new' | 'your-move' | 'wrong' | 'opponent' | 'complete';
	let status = $state<DrillStatus>('idle');
	let feedback = $state<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null);
	let highlights = $state<Map<Key, string>>(new Map());
	let session = $state({ correct: 0, wrong: 0, lines: 0 });
	let oppTimer: ReturnType<typeof setTimeout>;

	function startDrill() {
		reset();
		feedback = null;
		highlights = new Map();
		step();
	}

	function isNeeded(f: string) {
		const c = cards.get(cardKey(lib!.id, f));
		return !c || c.due <= Date.now();
	}

	/** Number of learner positions below `f` that are new or due — steers the opponent toward lines you need. */
	function need(f: string, depth = 0, seen = new Set<string>()): number {
		const k = epd(f);
		if (depth > 60 || seen.has(k)) return 0;
		seen.add(k);
		const es = graph.get(k) ?? [];
		let n = es.length && turnOf(f) === lib!.side && isNeeded(f) ? 1 : 0;
		for (const e of es) n += need(e.fen, depth + 1, seen);
		return n;
	}

	function step() {
		if (!lib) return;
		const es = graph.get(epd(fen)) ?? [];
		if (!es.length) {
			status = 'complete';
			session.lines++;
			return;
		}
		if (turnOf(fen) === lib.side) {
			status = cards.has(cardKey(lib.id, fen)) ? 'your-move' : 'new';
			askedAt = performance.now();
			return;
		}
		status = 'opponent';
		const weights = es.map((e) => need(e.fen) + 0.15);
		let r = Math.random() * weights.reduce((a, b) => a + b, 0);
		const pick = es.find((_, i) => (r -= weights[i]) <= 0) ?? es[0];
		oppTimer = setTimeout(() => {
			push(pick.uci);
			step();
		}, 420);
	}

	/** When the current question appeared — think time feeds the drill-time analytics (capped so idle time doesn't count). */
	let askedAt = 0;

	async function record(correct: boolean, f: string) {
		track({
			type: 'drill',
			lib: lib!.id,
			libName: lib!.name,
			position: epd(f),
			correct,
			wasNew: status === 'new',
			seconds: Math.min(60, (performance.now() - askedAt) / 1000)
		});
		const key = cardKey(lib!.id, f);
		const c = grade(cards.get(key), key, lib!.id, correct);
		cards.set(key, c);
		cardsVersion++;
		await saveCard(c);
	}

	function drillMove(uci: string) {
		if (!lib || !['new', 'your-move', 'wrong'].includes(status)) return;
		const f = fen;
		const es = graph.get(epd(f)) ?? [];
		const hit = es.find((e) => e.uci === uci || e.uci === uci.slice(0, 4));
		if (hit) {
			// Found unaided (new or review) counts as correct; after a miss/hint it was already graded.
			if (status === 'your-move' || status === 'new') {
				session.correct++;
				record(true, f);
			}
			const p = push(hit.uci)!;
			highlights = new Map([[p.to, 'good']]);
			feedback = hit.comment ? { kind: 'good', text: hit.comment } : { kind: 'good', text: `${hit.san} — correct.` };
			step();
		} else {
			const wrong = play(f, uci);
			if (status === 'your-move' || status === 'new') {
				session.wrong++;
				record(false, f);
			}
			status = 'wrong';
			highlights = wrong ? new Map([[wrong.to, 'bad']]) : new Map();
			feedback = { kind: 'bad', text: `${wrong?.san ?? 'That'} isn't in your repertoire. Play ${es.map((e) => e.san).join(' or ')}.` };
		}
	}

	function hint() {
		if (status === 'your-move' || status === 'new') {
			session.wrong++;
			record(false, fen);
			status = 'wrong';
			feedback = { kind: 'info', text: `Your move here: ${edges.map((e) => e.san).join(' or ')}.` };
		}
	}

	// No answer arrows while you're being tested — only after a wrong move or a hint.
	const drillShapes = $derived<DrawShape[]>(
		mode === 'drill' && status === 'wrong'
			? edges.map((e) => ({ orig: e.uci.slice(0, 2) as Key, dest: e.uci.slice(2, 4) as Key, brush: 'green' }))
			: []
	);

	const lastMove = $derived<[string, string] | null>(ply ? [line[ply - 1].from, line[ply - 1].to] : null);
</script>

<svelte:window onkeydown={onKey} />

{#if notFound}
	<p>Library not found. <a href="/openings" class="link">Back to libraries</a></p>
{:else if lib}
	<header class="row wrap">
		<a href="/openings" class="back faint">← Libraries</a>
		<h1>{lib.name}</h1>
		<span class="tag">{lib.side}</span>
		<span class="spacer"></span>
		<div class="seg">
			<button class:active={mode === 'explore'} onclick={() => setMode('explore')}>Explore</button>
			<button class:active={mode === 'drill'} onclick={() => setMode('drill')}>Drill</button>
		</div>
	</header>

	<div class="study">
		<div class="board-col">
			<Board
				{fen}
				{orientation}
				{lastMove}
				movable={mode === 'drill' ? lib.side : 'turn'}
				shapes={mode === 'drill' ? drillShapes : exploreShapes}
				highlights={mode === 'drill' ? highlights : undefined}
				onmove={mode === 'drill' ? drillMove : exploreMove}
			/>
			<div class="row controls">
				{#if mode !== 'drill'}
					<button onclick={() => (ply = 0)} title="Start (Home)">«</button>
					<button onclick={() => (ply = Math.max(0, ply - 1))} title="Back (←)">‹</button>
					<button onclick={() => (ply < line.length ? ply++ : edges[0] && push(edges[0].uci))} title="Forward (→)">›</button>
				{/if}
				<span class="spacer"></span>
				<button onclick={() => (orientation = orientation === 'white' ? 'black' : 'white')} title="Flip (f)">⇅ flip</button>
			</div>
		</div>

		<aside class="stack">
			<div class="panel stack">
				<label class="row">
					<span class="muted">Chapter</span>
					<select value={chapter} onchange={(e) => setChapter(+e.currentTarget.value)}>
						<option value={-1}>All chapters</option>
						{#each lib.chapters as ch, i (i)}<option value={i}>{ch.name}</option>{/each}
					</select>
				</label>
				<div class="opening">
					{#if opening}<span class="eco mono">{opening.eco}</span> {opening.name}{:else}<span class="faint">Starting position</span>{/if}
				</div>
			</div>

			{#if mode === 'explore'}
				<div class="panel stack">
					<h3>Repertoire moves</h3>
					{#if edges.length}
						<div class="row wrap">
							{#each edges as e (e.uci)}
								<button class="chip {turnOf(fen) === lib.side ? 'mine' : 'theirs'}" onclick={() => push(e.uci)}>{e.san}</button>
							{/each}
						</div>
						<p class="faint small">{turnOf(fen) === lib.side ? 'Your move — green arrows.' : 'Opponent replies you should expect — blue arrows.'}</p>
					{:else if ply && !lastEdge}
						<p class="muted">Out of repertoire. <button class="sm" onclick={() => (ply = Math.max(0, ply - 1))}>Go back</button></p>
					{:else}
						<p class="muted">End of the prepared line.</p>
					{/if}
					{#if nodeComment}
						<blockquote>{nodeComment}</blockquote>
					{/if}
					{#if studyShapes.length}
						<label class="row small muted"><input type="checkbox" bind:checked={showStudyShapes} /> show study arrows ({studyShapes.length})</label>
					{/if}
				</div>
				<div class="panel"><MoveList moves={line} {ply} onselect={(p) => (ply = p)} /></div>
				<EngineLines {fen} bind:enabled={settings.showEngineInExplore} onplay={(u) => push(u)} />
			{:else}
				<div class="panel stack drill">
					<div class="status {status}">
						{#if status === 'new'}<b>New position</b><span>What does your repertoire play? Press Hint if you haven't learned it yet.</span>
						{:else if status === 'your-move'}<b>Your move</b><span>What does your repertoire play here?</span>
						{:else if status === 'wrong'}<b>{feedback?.kind === 'info' ? 'Hint' : 'Try again'}</b><span>Play the arrowed move.</span>
						{:else if status === 'opponent'}<b>Opponent thinking…</b><span>&nbsp;</span>
						{:else if status === 'complete'}<b>Line complete ✓</b><span>Nicely done.</span>
						{/if}
					</div>
					{#if feedback}<p class="fb {feedback.kind}">{feedback.text}</p>{/if}
					<div class="row">
						<button onclick={hint} disabled={status !== 'your-move' && status !== 'new'}>Hint</button>
						<button class={status === 'complete' ? 'primary' : ''} onclick={startDrill}>{status === 'complete' ? 'Next line →' : 'Restart line'}</button>
					</div>
				</div>
				<div class="panel stats">
					<div><b class="good">{session.correct}</b><span>correct</span></div>
					<div><b class="bad">{session.wrong}</b><span>missed</span></div>
					<div><b>{session.lines}</b><span>lines</span></div>
					<div><b class="gold">{progress?.due ?? 0}</b><span>due</span></div>
				</div>
				{#if progress}
					<div class="panel">
						<div class="row"><span class="muted">Learned</span><span class="spacer"></span><b>{progress.learned} / {progress.total}</b></div>
						<div class="meter"><span style="width:{progress.total ? (progress.learned / progress.total) * 100 : 0}%"></span></div>
						<p class="faint small">A move counts as learned after two correct reviews on separate days.</p>
					</div>
				{/if}
				<div class="panel"><MoveList moves={line} {ply} /></div>
			{/if}
		</aside>
	</div>
{/if}

<style>
	header { margin-bottom: 20px; gap: 14px; }
	.back { font-size: 0.88em; }
	.seg { display: flex; background: var(--bg-2); border: 1px solid var(--line); padding: 3px; }
	.seg button { border: 0; background: none; padding: 6px 16px; }
	.seg button.active { background: var(--panel-2); color: var(--gold-2); }
	.controls { margin-top: 12px; }
	.opening { font-size: 1em; }
	.eco { font-size: 0.88em; color: var(--gold-2); background: color-mix(in srgb, var(--gold) 10%, transparent); padding: 2px 6px; margin-right: 4px; }
	select { flex: 1; min-width: 0; }
	.chip { font-weight: 600; }
	.chip.mine { border-color: color-mix(in srgb, var(--good) 80%, transparent); color: var(--good); }
	.chip.theirs { border-color: color-mix(in srgb, var(--blue) 90%, transparent); color: var(--blue); }
	.small { font-size: 0.88em; }
	blockquote { margin: 0; white-space: pre-line; max-height: 260px; overflow-y: auto; padding: 10px 14px; border-left: 3px solid var(--gold); background: var(--bg-2); color: var(--text); font-size: 1em; line-height: 1.45; }
	.status { display: flex; flex-direction: column; padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--line); }
	.status b { font-size: 1.2em; }
	.status span { color: var(--muted); font-size: 0.88em; }
	.status.new { border-color: color-mix(in srgb, var(--blue) 60%, transparent); }
	.status.your-move { border-color: color-mix(in srgb, var(--gold) 60%, transparent); }
	.status.wrong { border-color: color-mix(in srgb, var(--bad) 70%, transparent); }
	.status.complete { border-color: color-mix(in srgb, var(--good) 70%, transparent); }
	.fb { font-size: 14px; padding: 2px 2px; }
	.fb.good { color: var(--good); }
	.fb.bad { color: var(--bad); }
	.fb.info { color: var(--blue); }
	.stats { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; padding: 12px; }
	.stats div { display: flex; flex-direction: column; }
	.stats b { font-size: 1.2em; }
	.stats span { font-size: 0.88em; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
	.good { color: var(--good); }
	.bad { color: var(--bad); }
	.gold { color: var(--gold-2); }
	.meter { height: 6px; background: var(--panel-2); overflow: hidden; margin: 8px 0; }
	.meter span { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-2)); }
</style>
