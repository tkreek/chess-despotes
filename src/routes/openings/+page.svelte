<script lang="ts">
	import { onMount } from 'svelte';
	import { allLibraries, cardsFor, progressOf, type LibProgress } from '#lib/srs.ts';
	import { parseLibrary, type Library } from '#lib/chess/library.ts';
	import { db } from '#lib/db.ts';
	import { uid } from '#lib/chess/util.ts';
	import LichessImport from '#lib/components/LichessImport.svelte';

	let libs = $state<{ lib: Library; prog: LibProgress }[]>([]);
	let showImport = $state(false);
	let showLichess = $state(false);
	const existing = $derived(new Set(libs.map((l) => l.lib.id)));
	let importName = $state('');
	let importText = $state('');
	let importError = $state('');
	let dragging = $state(false);

	async function refresh() {
		const ls = await allLibraries();
		libs = await Promise.all(ls.map(async (lib) => ({ lib, prog: progressOf(lib, await cardsFor(lib.id)) })));
	}
	onMount(refresh);

	async function doImport() {
		importError = '';
		try {
			const id = `user-${uid()}`;
			const lib = parseLibrary(importText, id, importName || 'Imported library', 'user');
			if (!lib.positions) throw new Error('No moves found in that PGN.');
			await (await db()).put('libraries', { id, name: importName || lib.name, pgn: importText, createdAt: Date.now() });
			showImport = false;
			importText = importName = '';
			await refresh();
		} catch (e) {
			importError = e instanceof Error ? e.message : String(e);
		}
	}

	async function onFiles(files: FileList | null | undefined) {
		const f = files?.[0];
		if (!f) return;
		importText = await f.text();
		importName ||= f.name.replace(/\.pgn$/i, '').replace(/[-_]/g, ' ');
		showImport = true;
	}

	async function remove(lib: Library) {
		if (!confirm(`Delete “${lib.name}” and its progress?`)) return;
		const d = await db();
		await d.delete('libraries', lib.id);
		for (const k of await d.getAllKeysFromIndex('cards', 'lib', lib.id)) await d.delete('cards', k);
		await refresh();
	}

</script>

<svelte:window
	ondragover={(e) => { e.preventDefault(); dragging = true; }}
	ondragleave={() => (dragging = false)}
	ondrop={(e) => { e.preventDefault(); dragging = false; onFiles(e.dataTransfer?.files); }}
/>

<header class="row">
	<div>
		<h1>Opening Libraries</h1>
		<p class="muted">Explore lines with commentary, then drill them with spaced repetition.</p>
	</div>
	<span class="spacer"></span>
	<button class:active={showLichess} onclick={() => ((showLichess = !showLichess), (showImport = false))}>⌕ Lichess studies</button>
	<button class="primary" onclick={() => ((showImport = !showImport), (showLichess = false))}>+ Add PGN</button>
</header>

{#if showLichess}<LichessImport {existing} onimported={refresh} />{/if}

{#if showImport}
	<div class="panel import stack">
		<div class="row wrap">
			<h3>Import a PGN library</h3>
			<span class="spacer"></span>
			<label class="btn sm">Choose file… <input type="file" accept=".pgn,text/plain" hidden onchange={(e) => onFiles(e.currentTarget.files)} /></label>
		</div>
		<p class="muted">
			Any PGN works — each game becomes a chapter, variations become branches and <code>{'{comments}'}</code> are shown while studying.
			Lichess study exports work directly. Add <code>[Side "black"]</code> for repertoires you play as Black. You can also drop
			<code>.pgn</code> files into the project's <code>openings/</code> folder to make them built-in.
		</p>
		<input placeholder="Library name (optional)" bind:value={importName} />
		<textarea rows="8" placeholder={'[Library "My Sicilian"]\n[Side "black"]\n\n1. e4 c5 2. Nf3 d6 (2... Nc6) 3. d4 cxd4 *'} bind:value={importText}></textarea>
		{#if importError}<p class="err">{importError}</p>{/if}
		<div class="row"><button class="primary" disabled={!importText.trim()} onclick={doImport}>Import</button><button class="ghost" onclick={() => (showImport = false)}>Cancel</button></div>
	</div>
{/if}

<div class="grid">
	{#each libs as { lib, prog } (lib.id)}
		<article class="panel lib">
			<div class="row">
				<span class="side {lib.side}" title="You play {lib.side}"></span>
				<h2>{lib.name}</h2>
				<span class="spacer"></span>
				<b class="pct">{prog.total ? Math.round((prog.learned / prog.total) * 100) : 0}%</b>
			</div>
			<div class="meter"><span style="width:{prog.total ? (prog.learned / prog.total) * 100 : 0}%"></span></div>
			{#if lib.description}<p class="muted desc">{lib.description}</p>{/if}
			<div class="row wrap meta">
				<span class="tag">{lib.side}</span>
				<span class="tag">{lib.chapters.length} chapters</span>
				<span class="tag">{prog.total} moves</span>
				{#if prog.due}<span class="tag gold">{prog.due} due</span>{/if}
				{#if lib.id.startsWith('lichess-')}<a class="tag gold" href="https://lichess.org/study/{lib.id.slice(8)}" target="_blank" rel="noreferrer">lichess ↗</a>
				{:else if lib.source === 'user'}<span class="tag">imported</span>{/if}
			</div>
			{#if lib.errors.length}<p class="err">{lib.errors.length} illegal move(s) skipped: {lib.errors[0]}</p>{/if}
			<ul class="chapters">
				{#each lib.chapters.slice(0, 5) as ch (ch.name)}<li>{ch.name}</li>{/each}
				{#if lib.chapters.length > 5}<li class="faint">+{lib.chapters.length - 5} more</li>{/if}
			</ul>
			<div class="row actions">
				<a class="btn primary" href="/openings/{lib.id}?mode=drill">{prog.due ? `Review ${prog.due}` : prog.seen < prog.total ? 'Learn' : 'Drill'}</a>
				<a class="btn" href="/openings/{lib.id}">Explore</a>
				<span class="spacer"></span>
				{#if lib.source === 'user'}<button class="ghost danger sm" onclick={() => remove(lib)}>Delete</button>{/if}
			</div>
		</article>
	{/each}
</div>

{#if dragging}<div class="drop">Drop a .pgn file to import it</div>{/if}

<style>
	header { margin-bottom: 24px; gap: 16px; align-items: flex-end; }
	header p { margin-top: 4px; }
	.import { margin-bottom: 24px; max-width: 860px; }
	code { font-family: var(--mono); font-size: 0.88em; background: var(--bg-2); padding: 1px 5px; color: var(--gold-2); }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
	.lib { display: flex; flex-direction: column; gap: 12px; }
	.side { width: 14px; height: 14px; border: 2px solid var(--line); flex: none; }
	.side.white { background: #f1ede4; }
	.side.black { background: #111; border-color: #555; }
	.pct { color: var(--gold); }
	.desc { font-size: 0.88em; }
	.chapters { margin: 0; padding: 0 0 0 18px; color: var(--muted); font-size: 0.88em; display: flex; flex-direction: column; gap: 2px; }
	.actions { margin-top: auto; }
	.err { color: var(--bad); font-size: 0.88em; }
	.drop { position: fixed; inset: 16px; border: 2px dashed var(--gold); font-family: var(--mono); background: color-mix(in srgb, var(--bg) 85%, transparent); display: grid; place-items: center; font: 600 22px var(--display); color: var(--gold-2); pointer-events: none; z-index: 50; }
</style>
