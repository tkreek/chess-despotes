<script lang="ts">
	import Board from '#lib/components/Board.svelte';
	import { settings, BOARD_THEMES, type BoardTheme } from '#lib/settings.svelte.ts';
	import { themeInfo } from '#lib/theme.ts';
	import { onMount } from 'svelte';

	let omarchyName = $state('');
	let omarchyFound = $state(false);
	onMount(() => {
		const t = setInterval(() => ((omarchyName = themeInfo.name), (omarchyFound = themeInfo.available)), 500);
		return () => clearInterval(t);
	});

	let msg = $state('');

	async function exportAll() {
		const data = await (await fetch('/api/backup')).json();
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
		a.download = `chess-despotes-backup-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async function importAll(f: File | undefined) {
		if (!f) return;
		try {
			const r = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await f.text() });
			if (!r.ok) throw new Error((await r.text()) || 'Restore failed');
			const c = await r.json();
			msg = `Restored ${c.games} games, ${c.libraries} libraries, ${c.cards} review cards.`;
		} catch (e) {
			msg = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<header>
	<h1>Settings</h1>
	<p class="muted">Saved automatically in this browser.</p>
</header>

<div class="grid">
	<div class="panel stack">
		<h3>Appearance</h3>
		<label class="row"><input type="checkbox" bind:checked={settings.followOmarchy} /> Follow my Omarchy theme</label>
		<p class="faint small">
			{#if !settings.followOmarchy}Using the built-in Despotes palette.
			{:else if omarchyFound}Following <b>{omarchyName.replace(/-/g, ' ')}</b> — switch themes with <code>omarchy theme set</code> and the app updates live.
			{:else}No Omarchy theme found. Theme sync works when running via <code>npm run dev</code> or <code>npm run preview</code>.{/if}
		</p>
		<h3>Board</h3>
		<div class="themes">
			{#each Object.entries(BOARD_THEMES) as [key, t] (key)}
				<button class="theme" class:active={settings.boardTheme === key} onclick={() => (settings.boardTheme = key as BoardTheme)}>
					<span class="sw" style="background:conic-gradient({t.dark} 0 25%, {t.light} 0 50%, {t.dark} 0 75%, {t.light} 0);background-size:50% 50%"></span>
					{t.name}
				</button>
			{/each}
		</div>
		<label class="row"><input type="checkbox" bind:checked={settings.coordinates} /> Show coordinates</label>
		<div class="preview"><Board fen="r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4" movable="none" lastMove={['g8', 'f6']} /></div>
	</div>

	<div class="stack">
		<div class="panel stack">
			<h3>You</h3>
			<label class="stack tight">
				<span class="muted">Your name (used to detect your color when importing PGNs)</span>
				<input bind:value={settings.playerName} placeholder="e.g. your lichess username" />
			</label>
		</div>

		<div class="panel stack">
			<h3>Engine</h3>
			<p class="faint small">Stockfish 19 “lite” — single-threaded WASM with a small neural net (~1.8 MB). Fast to load and gentle on your CPU.</p>
			<label class="stack tight">
				<span class="muted">Analysis depth: <b>{settings.analysisDepth}</b></span>
				<input type="range" min="10" max="26" bind:value={settings.analysisDepth} />
			</label>
			<label class="stack tight">
				<span class="muted">Game review depth: <b>{settings.reviewDepth}</b> <span class="faint">(higher = slower, more accurate)</span></span>
				<input type="range" min="8" max="20" bind:value={settings.reviewDepth} />
			</label>
		</div>

		<div class="panel stack">
			<h3>Your data</h3>
			<p class="faint small">Your games, libraries, review progress, checklist and stats are stored in a SQLite database on this machine (<code>~/.local/share/chess-despotes/chess.db</code>), per account. Export a JSON backup or restore one:</p>
			<div class="row">
				<button onclick={exportAll}>Export backup</button>
				<label class="btn">Restore backup… <input type="file" accept="application/json" hidden onchange={(e) => importAll(e.currentTarget.files?.[0])} /></label>
			</div>
			{#if msg}<p class="small" style="color:var(--gold-2)">{msg}</p>{/if}
		</div>
	</div>
</div>

<style>
	header { margin-bottom: 20px; }
	header p { margin-top: 4px; }
	.grid { display: grid; grid-template-columns: minmax(0, 460px) minmax(0, 460px); gap: 20px; align-items: start; }
	.themes { display: flex; flex-wrap: wrap; gap: 8px; }
	.theme { padding: 6px 12px 6px 6px; }
	.sw { width: 26px; height: 26px; display: inline-block; }
	.preview { width: 100%; max-width: 420px; }
	.tight { gap: 4px; }
	.small { font-size: 0.88em; }
	code { font-family: var(--mono); font-size: 0.88em; color: var(--gold-2); }
	input[type='range'] { accent-color: var(--gold); padding: 0; }
	input[type='checkbox'] { accent-color: var(--gold); }
	@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
