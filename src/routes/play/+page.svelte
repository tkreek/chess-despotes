<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Board from '#lib/components/Board.svelte';
	import MoveList from '#lib/components/MoveList.svelte';
	import { Engine, LEVELS } from '#lib/chess/engine.ts';
	import { START_FEN, epd, gameStatus, play, turnOf, type Played } from '#lib/chess/util.ts';
	import { loadEco, openingName } from '#lib/chess/eco.ts';
	import { allLibraries } from '#lib/srs.ts';
	import type { Library } from '#lib/chess/library.ts';
	import { saveGame } from '#lib/games.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import type { SavedGame } from '#lib/db.ts';
	import { page } from '$app/state';
	import { track } from '#lib/events.ts';

	let engine: Engine | null = null;
	let libs = $state.raw<Library[]>([]);
	let ecoReady = $state(false);

	// setup
	let level = $state(2);
	let colorChoice = $state<'white' | 'black' | 'random'>('white');
	let practiceId = $state('');

	// game
	let phase = $state<'setup' | 'playing' | 'over'>('setup');
	let myColor = $state<'white' | 'black'>('white');
	let line = $state<Played[]>([]);
	let result = $state<{ text: string; code: string } | null>(null);
	let thinking = $state(false);
	let bookNote = $state<string | null>(null);
	let inBook = $state(false);
	let saved = $state<SavedGame | null>(null);

	const fen = $derived(line.length ? line[line.length - 1].fen : START_FEN);
	const practice = $derived(libs.find((l) => l.id === practiceId) ?? null);
	const opening = $derived(ecoReady ? openingName([START_FEN, ...line.map((p) => p.fen)]) : null);
	const lastMove = $derived<[string, string] | null>(line.length ? [line.at(-1)!.from, line.at(-1)!.to] : null);

	// ---- blindfold mode (started from Vision → blindfold game) ----
	let blind = $state<{ board: 'empty' | 'none'; moves: boolean } | null>(null);
	let peeking = $state(false);
	let peeks = $state(0);
	let illegal = $state(0);
	let typed = $state('');
	let typeError = $state('');
	let speak = $state(false);
	let blindStarted = 0;
	const EMPTY = '8/8/8/8/8/8/8/8 w - - 0 1';
	const hidden = $derived(!!blind && phase === 'playing' && !peeking);
	const announce = $derived.by(() => {
		const last = line.at(-1);
		if (!last) return null;
		const n = Math.ceil(line.length / 2);
		return `${n}${line.length % 2 ? '.' : '...'} ${last.san}`;
	});

	const PIECE: Record<string, string> = { N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
	function sayMove(san: string) {
		if (!speak || typeof speechSynthesis === 'undefined') return;
		let t = san === 'O-O' ? 'castles kingside' : san === 'O-O-O' ? 'castles queenside' : san;
		t = t.replace(/^([NBRQK])/, (m) => `${PIECE[m]} `).replace(/x/, ' takes ').replace(/=([NBRQ])/, (_, p) => ` promotes to ${PIECE[p]}`);
		t = t.replace(/\+$/, ', check').replace(/#$/, ', checkmate').replace(/([a-h])([1-8])/g, '$1 $2');
		speechSynthesis.speak(new SpeechSynthesisUtterance(t));
	}

	function submitTyped(e: SubmitEvent) {
		e.preventDefault();
		typeError = '';
		const raw = typed.trim().replace(/0/g, 'O');
		if (!raw) return;
		if (phase !== 'playing' || thinking || turnOf(fen) !== myColor) return void (typeError = 'Wait for your turn');
		// Accept SAN with a lowercase piece letter too (nf3 → Nf3); keep b-pawn captures (bxc6) as typed first.
		const p = play(fen, raw) ?? play(fen, raw.replace(/^[nrqk]/, (c) => c.toUpperCase())) ?? play(fen, raw.replace(/^b(?!x?[a-h][1-8]$)/, 'B'));
		if (!p) {
			illegal++;
			typeError = `“${typed.trim()}” isn't a legal move here`;
			return;
		}
		typed = '';
		onmove(p.uci);
	}

	function peek(on: boolean) {
		if (!blind || phase !== 'playing') return;
		if (on && !peeking) peeks++;
		peeking = on;
	}

	onMount(async () => {
		const q = page.url.searchParams;
		if (q.get('blindfold') === '1') {
			blind = { board: q.get('board') === 'none' ? 'none' : 'empty', moves: q.get('moves') !== '0' };
			level = Math.max(0, Math.min(LEVELS.length - 1, +(q.get('level') ?? 2)));
			colorChoice = q.get('color') === 'black' ? 'black' : 'white';
			practiceId = '';
			start(true);
		}
		libs = await allLibraries();
		loadEco().then(() => (ecoReady = true));
		if (blind) return;
		try {
			const s = JSON.parse(localStorage.getItem('cd-play') ?? '{}');
			if (s.level !== undefined) level = s.level;
			if (s.colorChoice) colorChoice = s.colorChoice;
			if (s.practiceId) practiceId = s.practiceId;
		} catch {
			/* ignore */
		}
	});
	onDestroy(() => engine?.destroy());

	function start(keepBlind = false) {
		if (!keepBlind) blind = null;
		if (!blind)
			try {
				localStorage.setItem('cd-play', JSON.stringify({ level, colorChoice, practiceId }));
			} catch {
				/* ignore */
			}
		peeks = illegal = 0;
		peeking = false;
		typed = typeError = '';
		blindStarted = performance.now();
		myColor = colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorChoice;
		if (practice) myColor = practice.side;
		line = [];
		result = null;
		saved = null;
		bookNote = null;
		inBook = !!practice;
		phase = 'playing';
		engine ??= new Engine();
		if (myColor === 'black') engineMove();
	}

	function checkEnd() {
		const s = gameStatus(fen);
		if (!s) return false;
		const code = s.startsWith('White') ? '1-0' : s.startsWith('Black') ? '0-1' : '1/2-1/2';
		end({ text: s, code });
		return true;
	}

	async function end(r: { text: string; code: string }) {
		result = r;
		phase = 'over';
		peeking = false;
		engine?.stop();
		if (blind)
			track({
				type: 'vision',
				mode: 'blindfold',
				variant: `${LEVELS[level].label} · ${myColor} · ${r.code} · ${peeks} peeks`,
				hits: line.filter((_, i) => (i % 2 === 0) === (myColor === 'white')).length,
				misses: illegal,
				avgMs: null,
				seconds: (performance.now() - blindStarted) / 1000
			});
		if (!line.length) return;
		const lvl = LEVELS[level];
		const me = settings.playerName || 'You';
		const bot = `Stockfish (${lvl.label})`;
		saved = await saveGame(
			{
				headers: {
					Event: blind ? `Blindfold game (${peeks} peek${peeks === 1 ? '' : 's'})` : practice ? `Practice: ${practice.name}` : 'Casual game',
					Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
					White: myColor === 'white' ? me : bot,
					Black: myColor === 'black' ? me : bot,
					Result: r.code
				},
				startFen: START_FEN,
				plies: line.map(({ san, uci, fen }) => ({ san, uci, fen }))
			},
			{ myColor, source: 'engine' }
		);
	}

	function onmove(uci: string) {
		if (phase !== 'playing' || thinking || turnOf(fen) !== myColor) return;
		const before = fen;
		const p = play(fen, uci);
		if (!p) return;
		if (practice && inBook) {
			const edges = practice.graph.get(epd(before)) ?? [];
			if (edges.length && !edges.some((e) => e.uci === p.uci)) {
				inBook = false;
				bookNote = `You left your ${practice.name} repertoire — it plays ${edges.map((e) => e.san).join(' or ')} here.`;
			} else if (!edges.length) inBook = false;
		}
		line = [...line, p];
		if (!checkEnd()) engineMove();
	}

	async function engineMove() {
		thinking = true;
		const f = fen;
		let uci: string | null = null;
		if (practice && inBook) {
			const edges = practice.graph.get(epd(f)) ?? [];
			if (edges.length) {
				uci = edges[Math.floor(Math.random() * edges.length)].uci;
				await new Promise((r) => setTimeout(r, 450));
			} else {
				inBook = false;
				bookNote ??= `End of your prepared ${practice.name} line — you're on your own now.`;
			}
		}
		if (!uci) {
			const lvl = LEVELS[level];
			const t0 = performance.now();
			const r = await engine!.search(f, { skill: lvl.skill, depth: lvl.depth, movetime: lvl.movetime });
			uci = r.bestmove;
			const wait = 350 - (performance.now() - t0);
			if (wait > 0) await new Promise((res) => setTimeout(res, wait));
		}
		thinking = false;
		if (phase !== 'playing' || fen !== f || !uci || uci === '(none)') return;
		const p = play(f, uci);
		if (p) {
			line = [...line, p];
			if (blind) sayMove(p.san);
		}
		checkEnd();
	}

	function takeback() {
		if (thinking || line.length < 1) return;
		const n = turnOf(fen) === myColor ? 2 : 1;
		line = line.slice(0, Math.max(0, line.length - n));
		bookNote = null;
		inBook = !!practice && line.every((p, i) => (practice!.graph.get(epd(i ? line[i - 1].fen : START_FEN)) ?? []).some((e) => e.uci === p.uci));
		if (turnOf(fen) !== myColor) engineMove();
	}

	function resign() {
		end({ text: `${myColor === 'white' ? 'White' : 'Black'} resigned`, code: myColor === 'white' ? '0-1' : '1-0' });
	}
</script>

<header>
	<h1>{blind ? 'Blindfold game' : 'Play'}</h1>
	<p class="muted">{blind ? 'Type your moves; the pieces stay hidden until the game ends. Hold peek to glance.' : 'Play the lightweight engine — every finished game is saved to My Games for review.'}</p>
</header>

<div class="study">
	<div class="board-col">
		{#if blind && hidden && blind.board === 'none'}
			<div class="void">
				<span class="faint">{thinking ? 'engine thinking…' : turnOf(fen) === myColor ? 'your move' : ''}</span>
				<b class="said">{announce ?? (myColor === 'white' ? 'you start' : '…')}</b>
			</div>
		{:else}
			<Board
				fen={hidden ? EMPTY : fen}
				orientation={phase === 'setup' ? (colorChoice === 'black' ? 'black' : 'white') : myColor}
				lastMove={hidden ? null : lastMove}
				movable={blind || phase !== 'playing' || thinking ? 'none' : myColor}
				{onmove}
			/>
		{/if}
		{#if blind && phase === 'playing'}
			<form class="row typer" onsubmit={submitTyped}>
				<span class="said-sm">{announce ?? ''}</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input bind:value={typed} placeholder={turnOf(fen) === myColor ? 'your move, e.g. Nf3' : 'wait…'} autofocus autocomplete="off" spellcheck="false" />
				<button class="primary" disabled={thinking || turnOf(fen) !== myColor}>play</button>
				<button type="button" class="peek" onpointerdown={() => peek(true)} onpointerup={() => peek(false)} onpointerleave={() => peek(false)}>peek ({peeks})</button>
			</form>
			{#if typeError}<p class="bad">! {typeError}</p>{/if}
		{/if}
	</div>
	<aside class="stack">
		{#if phase === 'setup'}
			<div class="panel stack">
				<h3>Opponent strength</h3>
				<div class="levels">
					{#each LEVELS as l, i (l.label)}
						<button class:active={level === i} onclick={() => (level = i)}>
							<b>{l.label}</b><span>{l.elo}</span>
						</button>
					{/each}
				</div>
				<h3>Your color</h3>
				<div class="row">
					{#each ['white', 'random', 'black'] as const as c (c)}
						<button class="color" class:active={colorChoice === c} onclick={() => (colorChoice = c)} disabled={!!practice}>
							<span class="dot {c}"></span>{c}
						</button>
					{/each}
				</div>
				<h3>Practice a repertoire <span class="faint">(optional)</span></h3>
				<select bind:value={practiceId}>
					<option value="">Off — normal game</option>
					{#each libs as l (l.id)}<option value={l.id}>{l.name} ({l.side})</option>{/each}
				</select>
				{#if practice}<p class="faint small">The engine will follow your library's opponent moves until the line ends, then play normally. You play {practice.side}.</p>{/if}
				<button class="primary big" onclick={() => start()}>Start game</button>
			</div>
		{:else}
			<div class="panel stack">
				<div class="row">
					<span class="dot {myColor}"></span>
					<b class="who">You vs Stockfish · {LEVELS[level].label}</b>
				</div>
				{#if opening}<div class="opening"><span class="eco mono">{opening.eco}</span> {opening.name}</div>{/if}
				{#if practice}
					<p class="small {inBook ? 'book' : 'faint'}">{inBook ? `📖 In book: ${practice.name}` : 'Out of book'}</p>
				{/if}
				{#if bookNote}<p class="note">{bookNote}</p>{/if}
				{#if phase === 'over' && result}
					<div class="result">
						<b>{result.code.replace('1/2-1/2', '½–½')}</b>
						<span>{result.text}</span>
					</div>
					<div class="row wrap">
						{#if saved}<a class="btn primary" href="/analysis?game={saved.id}">Analyze game</a>{/if}
						<button onclick={() => (blind ? start(true) : (phase = 'setup'))}>{blind ? 'New blindfold game' : 'New game'}</button>
					</div>
					{#if saved}<p class="faint small">Saved to My Games.</p>{/if}
				{:else}
					<div class="row">
						<span class="status">{thinking ? 'Engine thinking…' : turnOf(fen) === myColor ? 'Your move' : ''}</span>
						<span class="spacer"></span>
						<button class="sm" onclick={takeback} disabled={thinking || !line.length}>Takeback</button>
						<button class="sm danger" onclick={resign}>Resign</button>
					</div>
				{/if}
			</div>
			{#if blind}
				<div class="panel stack">
					<h3>blindfold</h3>
					<div class="row wrap small"><span>peeks <b>{peeks}</b></span><span>illegal tries <b>{illegal}</b></span></div>
					<label class="row small"><input type="checkbox" bind:checked={speak} /> read engine moves aloud</label>
				</div>
			{/if}
			{#if !blind || blind.moves || phase === 'over'}<div class="panel"><MoveList moves={line} ply={line.length} /></div>{/if}
		{/if}
	</aside>
</div>

<style>
	header { margin-bottom: 20px; }
	header p { margin-top: 4px; }
	.levels { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
	.levels button { flex-direction: column; gap: 0; padding: 8px 4px; }
	.levels b { font-weight: 600; }
	.levels span { font-size: 0.88em; color: var(--muted); }
	.color { flex: 1; justify-content: center; text-transform: capitalize; }
	.dot { width: 14px; height: 14px; border: 2px solid #555; display: inline-block; }
	.dot.white { background: #f1ede4; }
	.dot.black { background: #111; }
	.dot.random { background: linear-gradient(90deg, #f1ede4 50%, #111 50%); }
	.big { justify-content: center; padding: 11px; font-size: 1em; margin-top: 6px; }
	.small { font-size: 0.88em; }
	.who { font-size: 1em; }
	.eco { font-size: 0.88em; color: var(--gold-2); background: color-mix(in srgb, var(--gold) 10%, transparent); padding: 2px 6px; }
	.book { color: var(--blue); }
	.note { font-size: 0.88em; padding: 10px 12px; background: color-mix(in srgb, var(--gold) 8%, transparent); border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent); }
	.result { display: flex; flex-direction: column; align-items: center; padding: 14px; background: var(--bg-2); }
	.result b { font-size: 1.9em; }
	.result span { color: var(--muted); }
	.status { color: var(--muted); }
	.void { aspect-ratio: 1; border: 1px dashed var(--frame); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
	.said { font-size: clamp(40px, 7vw, 84px); color: var(--gold); }
	.typer { margin-top: 14px; }
	.typer input { flex: 1; min-width: 0; font-size: 1.15em; }
	.said-sm { color: var(--gold); min-width: 9ch; font-weight: 700; }
	.peek { user-select: none; touch-action: none; }
	.bad { color: var(--bad); margin-top: 6px; }
</style>
