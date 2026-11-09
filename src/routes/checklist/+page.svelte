<script lang="ts">
	import { onMount } from 'svelte';
	import Board from '#lib/components/Board.svelte';
	import { loadCatalog, loadChecked, saveChecked, type CNode } from '#lib/checklist.ts';
	import { START_FEN, play } from '#lib/chess/util.ts';

	let roots = $state.raw<CNode[]>([]);
	let checked = $state.raw(new Set<string>());
	let loading = $state(true);

	let q = $state('');
	let filter = $state<'all' | 'started' | 'todo' | 'done'>('all');
	let expanded = $state.raw(new Set<string>());
	let selected = $state.raw<CNode | null>(null);

	onMount(async () => {
		[roots, checked] = await Promise.all([loadCatalog(), loadChecked()]);
		loading = false;
	});

	// ---- checking ----
	let saveTimer: ReturnType<typeof setTimeout>;
	function commit(next: Set<string>) {
		checked = next;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveChecked(next), 250);
	}
	function toggle(n: CNode) {
		const next = new Set(checked);
		if (next.has(n.key)) next.delete(n.key);
		else next.add(n.key);
		commit(next);
	}
	/** Tick (or untick, if all are ticked) a whole branch. */
	function toggleBranch(n: CNode) {
		const next = new Set(checked);
		const all = n.all.every((k) => next.has(k));
		for (const k of n.all) all ? next.delete(k) : next.add(k);
		commit(next);
	}
	const count = (n: CNode) => n.all.reduce((c, k) => c + (checked.has(k) ? 1 : 0), 0);

	// ---- filtering ----
	const query = $derived(q.trim().toLowerCase());
	const filtering = $derived(!!query || filter !== 'all');

	/** Keys of nodes to show (matches + their ancestors), or null when not filtering. */
	const visible = $derived.by(() => {
		if (!filtering) return null;
		const out = new Set<string>();
		const selfOk = (n: CNode) =>
			(!query || n.key.toLowerCase().includes(query) || n.lines.some((l) => l.eco.toLowerCase() === query)) &&
			(filter !== 'todo' || !checked.has(n.key)) &&
			(filter !== 'done' || checked.has(n.key));
		const walk = (n: CNode): boolean => {
			const ok = selfOk(n);
			let any = false;
			for (const c of n.children) any = walk(c) || any;
			if (ok || any) out.add(n.key);
			return ok || any;
		};
		for (const r of roots) {
			if (filter === 'started' && !r.all.some((k) => checked.has(k))) continue;
			walk(r);
		}
		return out;
	});
	const shownRoots = $derived(visible ? roots.filter((r) => visible.has(r.key)) : roots);
	const kids = (n: CNode) => (visible ? n.children.filter((c) => visible.has(c.key)) : n.children);
	// Searching or listing learned items opens everything that matched; otherwise rows open on demand.
	const isOpen = (n: CNode) => (query || filter === 'done' ? true : expanded.has(n.key));

	function toggleOpen(n: CNode) {
		const next = new Set(expanded);
		if (next.has(n.key)) next.delete(n.key);
		else next.add(n.key);
		expanded = next;
	}
	function collapseAll() {
		expanded = new Set();
	}
	function expandStarted() {
		const next = new Set<string>();
		const walk = (n: CNode) => {
			if (n.children.length && n.all.some((k) => checked.has(k))) {
				next.add(n.key);
				n.children.forEach(walk);
			}
		};
		roots.forEach(walk);
		expanded = next;
	}

	// ---- totals ----
	const totals = $derived.by(() => {
		let total = 0;
		for (const r of roots) total += r.all.length;
		const started = roots.filter((r) => r.all.some((k) => checked.has(k))).length;
		return { total, done: checked.size, started };
	});

	// ---- preview ----
	const preview = $derived.by(() => {
		const line = selected?.lines[0];
		if (!line) return null;
		let fen = START_FEN;
		let last: [string, string] | null = null;
		for (const u of line.uci.split(' ')) {
			const p = play(fen, u);
			if (!p) break;
			fen = p.fen;
			last = [p.from, p.to];
		}
		return { fen, last, line };
	});
</script>

{#snippet item(n: CNode)}
	{@const ch = kids(n)}
	{@const open = isOpen(n)}
	{@const done = checked.has(n.key)}
	{@const c = n.children.length ? count(n) : 0}
	<li>
		<div class="row-line" class:sel={selected?.key === n.key}>
			{#if n.children.length}
				<button class="tw ghost" onclick={() => toggleOpen(n)} aria-label={open ? 'Collapse' : 'Expand'}>{open ? '▾' : '▸'}</button>
			{:else}
				<span class="tw leaf">─</span>
			{/if}
			<button class="box ghost" class:on={done} onclick={() => toggle(n)} aria-pressed={done} aria-label="Learned: {n.key}">[{done ? 'x' : ' '}]</button>
			<button class="name ghost" class:done class:fam={n.depth === 0} onclick={() => ((selected = n), n.children.length && !open && toggleOpen(n))}>
				{n.label}
			</button>
			{#if n.lines.length}<span class="eco">{n.eco}</span>{/if}
			<span class="spacer"></span>
			{#if n.children.length}
				<button class="all sm ghost" onclick={() => toggleBranch(n)} title="Tick or untick this whole branch">all</button>
				<span class="meter mini" title="{c}/{n.all.length} learned"><span style="width:{(c / n.all.length) * 100}%"></span></span>
				<span class="frac" class:complete={c === n.all.length}>{c}/{n.all.length}</span>
			{/if}
		</div>
		{#if ch.length && open}
			<ul>{#each ch as k (k.key)}{@render item(k)}{/each}</ul>
		{/if}
	</li>
{/snippet}

<header class="row wrap">
	<div>
		<h1>Openings Checklist</h1>
		<p class="muted">Tick off the openings and continuations you've learned.</p>
	</div>
	<span class="spacer"></span>
	<div class="sum">
		<b>{totals.done}</b><span class="faint">/{totals.total} lines</span> · <b>{totals.started}</b><span class="faint">/{roots.length} openings started</span>
	</div>
</header>

{#if loading}
	<p class="muted">Loading catalog…</p>
{:else}
	<div class="layout">
		<div class="panel list-panel">
			<h3>named openings</h3>
			<div class="row wrap tools">
				<input class="q" placeholder="search name or ECO (e.g. caro advance, B12)" bind:value={q} />
				<div class="seg">
					<button class:active={filter === 'all'} onclick={() => (filter = 'all')}>all</button>
					<button class:active={filter === 'started'} onclick={() => (filter = 'started')}>started</button>
					<button class:active={filter === 'todo'} onclick={() => (filter = 'todo')}>to learn</button>
					<button class:active={filter === 'done'} onclick={() => (filter = 'done')}>learned</button>
				</div>
				<button class="sm" onclick={expandStarted}>open started</button>
				<button class="sm" onclick={collapseAll}>collapse</button>
			</div>
			<ul class="root">
				{#each shownRoots as r (r.key)}{@render item(r)}{/each}
			</ul>
			{#if !shownRoots.length}<p class="faint">Nothing matches.</p>{/if}
		</div>

		<aside class="side">
			{#if preview && selected}
				<div class="panel stack">
					<h3>{selected.eco}</h3>
					<b class="title">{selected.key}</b>
					<Board fen={preview.fen} movable="none" lastMove={preview.last} orientation="white" />
					<p class="moves">{preview.line.pgn}</p>
					{#if selected.lines.length > 1}<p class="faint small">+{selected.lines.length - 1} other move order{selected.lines.length > 2 ? 's' : ''}</p>{/if}
					<div class="row wrap">
						<button class:primary={!checked.has(selected.key)} onclick={() => toggle(selected!)}>
							{checked.has(selected.key) ? '[x] learned' : '[ ] mark learned'}
						</button>
						<a class="btn" href="/analysis?fen={encodeURIComponent(START_FEN)}&moves={preview.line.uci.replace(/ /g, '+')}&ply={preview.line.uci.split(' ').length}">analyze ↗</a>
					</div>
				</div>
			{:else}
				<div class="panel">
					<h3>preview</h3>
					<p class="faint">Click an opening name to see its position and moves.</p>
				</div>
			{/if}
		</aside>
	</div>
{/if}

<style>
	header { margin-bottom: 18px; gap: 16px; align-items: flex-end; }
	header p { margin-top: 4px; }
	.sum b { color: var(--gold); }
	.layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 24px; align-items: start; }
	.side { position: sticky; top: 16px; }
	.tools { margin-bottom: 10px; }
	.q { flex: 1; min-width: 220px; }
	.seg { display: flex; }
	.root { max-height: calc(100vh - 250px); overflow-y: auto; }
	ul { list-style: none; margin: 0; padding: 0; }
	ul ul { margin-left: 1.9ch; padding-left: 1.6ch; border-left: 1px solid var(--frame); }
	li { position: relative; }
	ul ul > li::before { content: ''; position: absolute; left: -1.6ch; top: 0.9em; width: 1.2ch; border-top: 1px solid var(--frame); }
	.row-line { display: flex; align-items: center; gap: 2px; min-height: 1.8em; }
	.row-line:hover { background: var(--c-fill); }
	.row-line:hover .all { visibility: visible; }
	.row-line.sel { background: var(--c-hover); }
	.tw { width: 2ch; flex: none; padding: 0; justify-content: center; color: var(--gold); border: 0; }
	.tw.leaf { color: var(--frame); text-align: center; }
	.box { padding: 0 4px; border: 0; color: var(--faint); white-space: pre; }
	.box.on { color: var(--good); font-weight: 700; }
	.name { padding: 0 4px; border: 0; text-align: left; white-space: normal; }
	.name:hover { color: var(--gold); }
	.name.fam { font-weight: 700; }
	.name.done { color: var(--good); }
	.eco { font-size: 0.8em; color: var(--faint); margin-left: 4px; }
	.all { visibility: hidden; padding: 0 6px; }
	.meter.mini { width: 8ch; height: 7px; flex: none; }
	.frac { width: 8ch; text-align: right; font-size: 0.82em; color: var(--faint); flex: none; }
	.frac.complete { color: var(--good); }
	.title { color: var(--text); }
	.moves { font-size: 0.9em; color: var(--muted); }
	.small { font-size: 0.85em; }
	@media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } .side { position: static; } }
</style>
