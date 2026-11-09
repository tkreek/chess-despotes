<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import GridBoard from '#lib/components/GridBoard.svelte';
	import { kvGet, kvSet } from '#lib/db.ts';
	import { track } from '#lib/events.ts';
	import { LEVELS } from '#lib/chess/engine.ts';

	type Tab = 'coords' | 'colors' | 'blindfold';
	let tab = $state<Tab>('coords');

	// ---------- shared settings (remembered per browser) ----------
	const LIMITS = [5, 3, 2, 1.5, 1];
	let cfg = $state({ limit: 3, rush: false, side: 'white' as 'white' | 'black' | 'random', coordinates: false, length: 20 });
	let bf = $state({ level: 2, color: 'white' as 'white' | 'black', board: 'empty' as 'empty' | 'none', moves: true });
	onMount(() => {
		try {
			Object.assign(cfg, JSON.parse(localStorage.getItem('cd-vision') ?? '{}'));
			Object.assign(bf, JSON.parse(localStorage.getItem('cd-blindfold') ?? '{}'));
		} catch {
			/* ignore */
		}
	});
	$effect(() => {
		try {
			localStorage.setItem('cd-vision', JSON.stringify(cfg));
			localStorage.setItem('cd-blindfold', JSON.stringify(bf));
		} catch {
			/* ignore */
		}
	});

	// ---------- drill engine (used by both coordinates and colors) ----------
	const RUSH_SECONDS = 30;
	const SQUARES = [...'abcdefgh'].flatMap((f) => [...'12345678'].map((r) => f + r));
	const isLight = (sq: string) => (sq.charCodeAt(0) - 97 + +sq[1]) % 2 === 0;

	let phase = $state<'setup' | 'running' | 'done'>('setup');
	let target = $state('');
	let orientation = $state<'white' | 'black'>('white');
	let asked = $state(0);
	let hits = $state(0);
	let misses = $state(0);
	let times: number[] = [];
	let askedAt = 0;
	let startedAt = 0;
	let busy = false;
	let progress = $state(0); // 0..1 of the per-square limit (or of the rush clock)
	let flashes = $state<Record<string, 'good' | 'bad' | 'target'>>({});
	let lastAnswer = $state<'good' | 'bad' | 'timeout' | null>(null);
	let raf = 0;
	let result = $state<{ hits: number; misses: number; avgMs: number | null; best: boolean; variant: string } | null>(null);

	const mode = $derived(tab === 'colors' ? 'colors' : cfg.rush ? 'rush' : 'coords');
	const variant = $derived(
		mode === 'rush'
			? `${RUSH_SECONDS}s rush · ${cfg.side}${cfg.coordinates ? ' · coords' : ''}`
			: mode === 'colors'
				? `${cfg.limit}s per square`
				: `${cfg.limit}s per square · ${cfg.side}${cfg.coordinates ? ' · coords' : ''}`
	);

	function nextSquare() {
		let sq: string;
		do sq = SQUARES[Math.floor(Math.random() * 64)];
		while (sq === target);
		target = sq;
		askedAt = performance.now();
		asked++;
		busy = false;
		lastAnswer = null;
	}

	function start() {
		cancelAnimationFrame(raf);
		phase = 'running';
		orientation = cfg.side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : cfg.side;
		asked = hits = misses = 0;
		times = [];
		flashes = {};
		result = null;
		target = '';
		startedAt = performance.now();
		nextSquare();
		raf = requestAnimationFrame(tick);
	}

	function tick(now: number) {
		if (phase !== 'running') return;
		if (mode === 'rush') {
			progress = Math.min(1, (now - startedAt) / (RUSH_SECONDS * 1000));
			if (progress >= 1) return void finish();
		} else {
			progress = busy ? progress : Math.min(1, (now - askedAt) / (cfg.limit * 1000));
			if (!busy && progress >= 1) answer(null);
		}
		raf = requestAnimationFrame(tick);
	}

	/** pick = clicked square (coords) or 'light'/'dark' (colors); null = timed out */
	function answer(pick: string | null) {
		if (phase !== 'running' || busy) return;
		const ok = pick !== null && (mode === 'colors' ? (pick === 'light') === isLight(target) : pick === target);
		const ms = performance.now() - askedAt;
		if (ok) {
			hits++;
			times.push(ms);
			lastAnswer = 'good';
			if (mode !== 'colors') flashes = { [target]: 'good' };
		} else {
			misses++;
			lastAnswer = pick === null ? 'timeout' : 'bad';
			if (mode !== 'colors') flashes = pick && pick !== target ? { [pick]: 'bad', [target]: 'target' } : { [target]: 'target' };
		}
		busy = true;
		const pause = ok ? (mode === 'rush' ? 120 : 220) : 650;
		setTimeout(() => {
			flashes = {};
			if (phase !== 'running') return;
			if (mode !== 'rush' && asked >= cfg.length) finish();
			else nextSquare();
		}, pause);
	}

	async function finish() {
		cancelAnimationFrame(raf);
		phase = 'done';
		const avgMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
		const key = `${mode}|${variant}`;
		const bests = await kvGet<Record<string, { hits: number; avgMs: number | null }>>('visionBest', {});
		const prev = bests[key];
		const better = !prev || hits > prev.hits || (hits === prev.hits && avgMs !== null && (prev.avgMs === null || avgMs < prev.avgMs));
		if (better && hits > 0) {
			bests[key] = { hits, avgMs };
			kvSet('visionBest', bests);
		}
		result = { hits, misses, avgMs, best: better && hits > 0 && !!prev, variant };
		track({ type: 'vision', mode, variant, hits, misses, avgMs, seconds: (performance.now() - startedAt) / 1000 });
	}

	function stop() {
		cancelAnimationFrame(raf);
		phase = 'setup';
		flashes = {};
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
		if (phase !== 'running') {
			if ((e.key === 'Enter' || e.key === ' ') && tab !== 'blindfold') (e.preventDefault(), start());
			return;
		}
		if (e.key === 'Escape') return stop();
		if (mode === 'colors') {
			if (e.key === 'l' || e.key === 'ArrowLeft') (e.preventDefault(), answer('light'));
			if (e.key === 'd' || e.key === 'ArrowRight') (e.preventDefault(), answer('dark'));
		}
	}

	function setTab(t: Tab) {
		stop();
		tab = t;
	}

	onDestroy(() => cancelAnimationFrame(raf));

	const accuracy = (h: number, m: number) => (h + m ? Math.round((h / (h + m)) * 100) : 0);
	const remaining = $derived(mode === 'rush' ? Math.max(0, Math.ceil(RUSH_SECONDS * (1 - progress))) : null);

	function startBlindfold() {
		goto(`/play?blindfold=1&level=${bf.level}&color=${bf.color}&board=${bf.board}&moves=${bf.moves ? 1 : 0}`);
	}
</script>

<svelte:window onkeydown={onKey} />

<header class="row wrap">
	<div>
		<h1>Vision</h1>
		<p class="muted">Train board vision: find squares fast, know their colors blind, and play without seeing the pieces.</p>
	</div>
	<span class="spacer"></span>
	<div class="seg">
		<button class:active={tab === 'coords'} onclick={() => setTab('coords')}>coordinates</button>
		<button class:active={tab === 'colors'} onclick={() => setTab('colors')}>square color</button>
		<button class:active={tab === 'blindfold'} onclick={() => setTab('blindfold')}>blindfold game</button>
	</div>
</header>

{#if tab === 'blindfold'}
	<div class="blind">
		<div class="panel stack">
			<h3>blindfold game</h3>
			<p class="muted">Play the engine without seeing the pieces. Type your moves (<code>e4</code>, <code>Nf3</code>, <code>O-O</code>, <code>exd5</code>, <code>e8=Q</code>); the engine's replies are announced. Hold <b>peek</b> to glance at the position — peeks are counted.</p>
			<span class="muted">opponent</span>
			<div class="levels">
				{#each LEVELS as l, i (l.label)}
					<button class:active={bf.level === i} onclick={() => (bf.level = i)}><b>{l.label}</b><span>{l.elo}</span></button>
				{/each}
			</div>
			<div class="row wrap">
				<span class="muted">you play</span>
				<div class="seg">
					<button class:active={bf.color === 'white'} onclick={() => (bf.color = 'white')}>white</button>
					<button class:active={bf.color === 'black'} onclick={() => (bf.color = 'black')}>black</button>
				</div>
				<span class="muted">board</span>
				<div class="seg">
					<button class:active={bf.board === 'empty'} onclick={() => (bf.board = 'empty')}>empty grid</button>
					<button class:active={bf.board === 'none'} onclick={() => (bf.board = 'none')}>none</button>
				</div>
				<label class="row"><input type="checkbox" bind:checked={bf.moves} /> show move list</label>
			</div>
			<button class="primary big" onclick={startBlindfold}>start blindfold game</button>
		</div>
	</div>
{:else}
	<div class="study">
		<div class="board-col">
			{#if tab === 'coords'}
				<GridBoard {orientation} coordinates={cfg.coordinates} {flashes} disabled={phase !== 'running'} onpick={(sq) => answer(sq)} />
			{:else}
				<div class="color-stage">
					{#if phase === 'running'}
						<div class="big-coord" class:good={lastAnswer === 'good'} class:bad={lastAnswer === 'bad' || lastAnswer === 'timeout'}>{target}</div>
						{#if lastAnswer && lastAnswer !== 'good'}<p class="muted">{target} is <b>{isLight(target) ? 'light' : 'dark'}</b></p>{/if}
						<div class="row answer">
							<button class="ans light" onclick={() => answer('light')}><kbd>L</kbd> light</button>
							<button class="ans dark" onclick={() => answer('dark')}><kbd>D</kbd> dark</button>
						</div>
					{:else}
						<p class="faint">No board here — picture it. Press <kbd>Enter</kbd> or start.</p>
					{/if}
				</div>
			{/if}
		</div>

		<aside class="stack">
			<div class="panel stack">
				<h3>{tab === 'coords' ? 'find the square' : 'light or dark?'}</h3>
				{#if phase === 'running'}
					{#if tab === 'coords'}
						<div class="prompt" class:good={lastAnswer === 'good'} class:bad={lastAnswer === 'bad' || lastAnswer === 'timeout'}>{target}</div>
					{/if}
					<div class="timer"><span style="width:{(1 - progress) * 100}%" class:low={progress > 0.7}></span></div>
					<div class="row score">
						<span><b class="good">{hits}</b> hit</span>
						<span><b class="bad">{misses}</b> miss</span>
						<span class="spacer"></span>
						<span class="faint">{mode === 'rush' ? `${remaining}s left` : `${Math.min(asked, cfg.length)}/${cfg.length}`}</span>
					</div>
					<button class="sm ghost" onclick={stop}>stop (esc)</button>
				{:else}
					{#if result}
						<div class="result">
							<b>{result.hits}</b><span>/{result.hits + result.misses} · {accuracy(result.hits, result.misses)}%</span>
							<p class="muted">{result.avgMs !== null ? `avg ${(result.avgMs / 1000).toFixed(2)}s per square` : 'no correct answers'}{result.best ? ' · new personal best!' : ''}</p>
							<p class="faint small">{result.variant}</p>
						</div>
					{/if}
					{#if tab === 'coords'}
						<div class="row wrap">
							<span class="muted">mode</span>
							<div class="seg">
								<button class:active={!cfg.rush} onclick={() => (cfg.rush = false)}>per square</button>
								<button class:active={cfg.rush} onclick={() => (cfg.rush = true)}>30s rush</button>
							</div>
						</div>
					{/if}
					{#if !cfg.rush || tab === 'colors'}
						<div class="row wrap">
							<span class="muted">time</span>
							<div class="seg">
								{#each LIMITS as l (l)}<button class:active={cfg.limit === l} onclick={() => (cfg.limit = l)}>{l}s</button>{/each}
							</div>
						</div>
						<div class="row wrap">
							<span class="muted">squares</span>
							<div class="seg">
								{#each [10, 20, 40] as n (n)}<button class:active={cfg.length === n} onclick={() => (cfg.length = n)}>{n}</button>{/each}
							</div>
						</div>
					{/if}
					{#if tab === 'coords'}
						<div class="row wrap">
							<span class="muted">side</span>
							<div class="seg">
								{#each ['white', 'black', 'random'] as const as s (s)}<button class:active={cfg.side === s} onclick={() => (cfg.side = s)}>{s}</button>{/each}
							</div>
						</div>
						<label class="row"><input type="checkbox" bind:checked={cfg.coordinates} /> show coordinates on board (easier)</label>
					{/if}
					<button class="primary big" onclick={start}>{result ? 'go again' : 'start'} <kbd>↵</kbd></button>
				{/if}
			</div>
		</aside>
	</div>
{/if}

<style>
	header { margin-bottom: 20px; gap: 14px; align-items: flex-end; }
	header p { margin-top: 4px; }
	.seg { display: flex; }
	.seg button { border-color: var(--c-border); }
	kbd { font: inherit; font-size: 0.8em; opacity: 0.75; }
	.prompt { font-size: 3.2em; font-weight: 700; text-align: center; letter-spacing: 0.05em; color: var(--text); line-height: 1.2; }
	.good { color: var(--good); }
	.bad { color: var(--bad); }
	.prompt.good, .big-coord.good { color: var(--good); }
	.prompt.bad, .big-coord.bad { color: var(--bad); }
	.timer { height: 8px; background: color-mix(in srgb, var(--text) 8%, transparent); }
	.timer span { display: block; height: 100%; background: var(--gold); }
	.timer span.low { background: var(--bad); }
	.score { gap: 16px; }
	.score b { font-size: 1.3em; }
	.result { text-align: center; padding: 8px 0; }
	.result b { font-size: 2.6em; }
	.result span { color: var(--muted); }
	.big { justify-content: center; padding: 9px; }
	.small { font-size: 0.85em; }
	.color-stage { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; border: 1px dashed var(--frame); }
	.big-coord { font-size: clamp(64px, 12vw, 140px); font-weight: 700; color: var(--text); line-height: 1; }
	.answer { gap: 16px; }
	.ans { padding: 14px 28px; font-size: 1.2em; }
	.ans.light { background: var(--board-light); color: #111; border-color: var(--board-light); }
	.ans.dark { background: var(--board-dark); color: #fff; border-color: var(--board-dark); }
	.blind { max-width: 760px; }
	.levels { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
	.levels button { flex-direction: column; gap: 0; padding: 6px 4px; }
	.levels span { font-size: 0.8em; color: var(--muted); }
</style>
