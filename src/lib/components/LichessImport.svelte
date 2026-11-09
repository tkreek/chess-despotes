<script lang="ts">
	import { searchStudies, fetchStudyPgn, studyIdFrom, splitPgn, guessSide, cleanName, buildLibraryPgn, type StudyPage, type StudyHit, type StudyOrder } from '../lichess.ts';
	import { parseLibrary, type TreeNode } from '../chess/library.ts';
	import { db } from '../db.ts';

	interface Props {
		existing: Set<string>;
		onimported?: (id: string) => void;
	}
	let { existing, onimported }: Props = $props();

	let q = $state('');
	let order = $state<StudyOrder>('popular');
	let page = $state<StudyPage | null>(null);
	let busy = $state(false);
	let error = $state('');

	interface ChapterInfo { name: string; moves: number; shapes: number; comments: number; include: boolean; error?: string }
	let preview = $state<{
		id: string;
		title: string;
		owner: string;
		games: string[];
		chapters: ChapterInfo[];
		side: 'white' | 'black';
		name: string;
	} | null>(null);
	let saved = $state<string | null>(null);

	async function search(p = 1) {
		error = '';
		saved = null;
		const id = studyIdFrom(q);
		if (id) return open({ id, name: '', likes: null, owner: '', updatedAt: 0, topics: [] });
		busy = true;
		try {
			page = await searchStudies(q, order, p);
			preview = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function stats(root: TreeNode) {
		let moves = 0, shapes = root.shapes?.length ?? 0, comments = root.comment ? 1 : 0;
		const walk = (n: TreeNode) => {
			for (const c of n.children) {
				moves++;
				shapes += c.shapes?.length ?? 0;
				if (c.comment) comments++;
				walk(c);
			}
		};
		walk(root);
		return { moves, shapes, comments };
	}

	async function open(hit: StudyHit) {
		error = '';
		saved = null;
		busy = true;
		try {
			const pgn = await fetchStudyPgn(hit.id);
			const games = splitPgn(pgn);
			const title = hit.name || games[0]?.match(/^\[StudyName "(.*)"\]/m)?.[1] || hit.id;
			const chapters = games.map((g, i): ChapterInfo => {
				const name = g.match(/^\[ChapterName "(.*)"\]/m)?.[1] ?? `Chapter ${i + 1}`;
				try {
					const lib = parseLibrary(g, 'preview', name, 'user');
					const s = stats(lib.chapters[0].root);
					return { name, ...s, include: s.moves > 0 || s.comments > 0, error: lib.errors[0] };
				} catch (e) {
					return { name, moves: 0, shapes: 0, comments: 0, include: false, error: 'Could not parse this chapter' };
				}
			});
			preview = { id: hit.id, title, owner: hit.owner, games, chapters, side: guessSide(title, games), name: cleanName(title) };
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function doImport() {
		if (!preview) return;
		const games = preview.games.filter((_, i) => preview!.chapters[i].include);
		if (!games.length) return void (error = 'Select at least one chapter.');
		const source = `https://lichess.org/study/${preview.id}`;
		const id = `lichess-${preview.id}`;
		const pgn = buildLibraryPgn(games, preview.name || preview.title, preview.side, source);
		await (await db()).put('libraries', { id, name: preview.name, pgn, createdAt: Date.now(), source });
		saved = id;
		onimported?.(id);
	}

	const totals = $derived(
		preview
			? preview.chapters.filter((c) => c.include).reduce((a, c) => ({ moves: a.moves + c.moves, shapes: a.shapes + c.shapes, n: a.n + 1 }), { moves: 0, shapes: 0, n: 0 })
			: null
	);
	const fmtDate = (t: number) => (t ? new Date(t).toLocaleDateString() : '');
</script>

<div class="panel stack li">
	<h3>lichess studies</h3>
	<form class="row" onsubmit={(e) => { e.preventDefault(); search(1); }}>
		<input class="q" placeholder="search (e.g. caro-kann), @username, or paste a study URL" bind:value={q} />
		<select bind:value={order} onchange={() => page && search(1)}>
			<option value="popular">popular</option>
			<option value="hot">hot</option>
			<option value="newest">newest</option>
			<option value="updated">updated</option>
		</select>
		<button class="primary" disabled={busy}>{busy ? '…' : 'search'}</button>
	</form>
	{#if error}<p class="err">! {error}</p>{/if}

	{#if preview}
		<div class="preview stack">
			<div class="row wrap">
				<button class="sm ghost" onclick={() => (preview = null)}>← results</button>
				<b class="title">{cleanName(preview.title)}</b>
				{#if preview.owner}<span class="faint">by {preview.owner}</span>{/if}
				<span class="spacer"></span>
				<a class="faint" href="https://lichess.org/study/{preview.id}" target="_blank" rel="noreferrer">open on lichess ↗</a>
			</div>
			<div class="chapters">
				{#each preview.chapters as ch, i (i)}
					<label class="ch" class:off={!ch.include}>
						<input type="checkbox" bind:checked={ch.include} />
						<span class="name">{cleanName(ch.name)}</span>
						<span class="faint">{ch.moves} moves</span>
						<span class="faint">{ch.comments} notes</span>
						<span class="faint">{ch.shapes} arrows</span>
						{#if ch.error}<span class="err" title={ch.error}>!</span>{/if}
					</label>
				{/each}
			</div>
			<div class="row wrap">
				<span class="muted">name</span>
				<input class="name-in" bind:value={preview.name} />
				<span class="muted">I play</span>
				<div class="seg">
					<button class:active={preview.side === 'white'} onclick={() => (preview!.side = 'white')}>white</button>
					<button class:active={preview.side === 'black'} onclick={() => (preview!.side = 'black')}>black</button>
				</div>
			</div>
			<div class="row wrap">
				<span class="faint">{totals?.n} chapters · {totals?.moves} moves · {totals?.shapes} arrows/highlights</span>
				<span class="spacer"></span>
				{#if saved}
					<a class="btn primary" href="/openings/{saved}">open library →</a>
				{:else}
					<button class="primary" onclick={doImport}>{existing.has(`lichess-${preview.id}`) ? 'update library' : 'import library'}</button>
				{/if}
			</div>
		</div>
	{:else if page}
		<div class="results">
			{#each page.results as r (r.id)}
				<button class="hit ghost" onclick={() => open(r)}>
					<span class="name">{cleanName(r.name) || r.id}</span>
					{#if existing.has(`lichess-${r.id}`)}<span class="tag gold">imported</span>{/if}
					<span class="spacer"></span>
					{#if r.likes !== null}<span class="faint">♥ {r.likes.toLocaleString()}</span>{/if}
					<span class="faint by">{r.owner}</span>
					<span class="faint date">{fmtDate(r.updatedAt)}</span>
				</button>
			{:else}
				<p class="faint">No studies found.</p>
			{/each}
		</div>
		{#if page.nbPages > 1}
			<div class="row">
				<button class="sm" disabled={busy || page.page <= 1} onclick={() => search(page!.page - 1)}>← prev</button>
				<span class="faint">page {page.page} / {page.nbPages} · {page.nbResults.toLocaleString()} studies</span>
				<button class="sm" disabled={busy || page.page >= page.nbPages} onclick={() => search(page!.page + 1)}>next →</button>
			</div>
		{/if}
	{:else}
		<p class="faint">
			Search public Lichess studies and import them as libraries — variations, comments, arrows and square highlights included.
		</p>
	{/if}
</div>

<style>
	.li { margin-bottom: 24px; max-width: 980px; }
	.q { flex: 1; min-width: 0; }
	.err { color: var(--bad); }
	.results { display: flex; flex-direction: column; max-height: 420px; overflow-y: auto; border-top: 1px solid var(--frame); }
	.hit { display: flex; width: 100%; gap: 12px; text-align: left; padding: 6px 8px; border-bottom: 1px dashed color-mix(in srgb, var(--text) 12%, transparent); }
	.hit:hover .name { color: var(--gold); }
	.hit .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.by { width: 130px; overflow: hidden; text-overflow: ellipsis; text-align: right; }
	.date { width: 90px; text-align: right; }
	.title { color: var(--gold); }
	.chapters { display: flex; flex-direction: column; max-height: 300px; overflow-y: auto; border: 1px solid var(--frame); }
	.ch { display: grid; grid-template-columns: auto 1fr 90px 80px 90px 16px; gap: 10px; align-items: center; padding: 4px 10px; cursor: pointer; }
	.ch:hover { background: var(--c-hover); }
	.ch.off .name { color: var(--faint); text-decoration: line-through; }
	.ch .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.name-in { flex: 1; min-width: 200px; }
	.seg { display: flex; }
	.seg button { border-color: var(--c-border); }
</style>
