<script lang="ts">
	import { onMount } from 'svelte';
	import { db, type SavedGame } from '#lib/db.ts';
	import { parsePgnGames, saveGame } from '#lib/games.ts';
	import { settings } from '#lib/settings.svelte.ts';

	let games = $state<SavedGame[]>([]);
	let showImport = $state(false);
	let text = $state('');
	let colorMode = $state<'auto' | 'white' | 'black' | 'none'>('auto');
	let msg = $state('');
	let filter = $state('');

	async function refresh() {
		games = (await (await db()).getAll('games')).sort((a, b) => b.createdAt - a.createdAt);
	}
	onMount(refresh);

	async function doImport() {
		msg = '';
		try {
			const parsed = parsePgnGames(text).filter((g) => g.plies.length);
			if (!parsed.length) throw new Error('No games with moves found.');
			const name = settings.playerName.trim().toLowerCase();
			for (const g of parsed) {
				let myColor: SavedGame['myColor'] = null;
				if (colorMode === 'white' || colorMode === 'black') myColor = colorMode;
				else if (colorMode === 'auto' && name) {
					if (g.headers.White?.toLowerCase() === name) myColor = 'white';
					else if (g.headers.Black?.toLowerCase() === name) myColor = 'black';
				}
				await saveGame(g, { myColor, source: 'import' });
			}
			msg = `Imported ${parsed.length} game${parsed.length > 1 ? 's' : ''}.`;
			text = '';
			showImport = false;
			await refresh();
		} catch (e) {
			msg = e instanceof Error ? e.message : String(e);
		}
	}

	async function onFile(f: File | undefined) {
		if (!f) return;
		text = await f.text();
		showImport = true;
	}

	async function remove(g: SavedGame) {
		if (!confirm('Delete this game?')) return;
		await (await db()).delete('games', g.id);
		await refresh();
	}

	function download(name: string, content: string) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([content], { type: 'application/x-chess-pgn' }));
		a.download = name;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function outcome(g: SavedGame) {
		if (!g.myColor || g.result === '*') return '';
		if (g.result === '1/2-1/2') return 'draw';
		return (g.result === '1-0') === (g.myColor === 'white') ? 'win' : 'loss';
	}

	const shown = $derived(
		games.filter((g) => !filter || `${g.white} ${g.black} ${g.opening ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
	);
</script>

<header class="row wrap">
	<div>
		<h1>My Games</h1>
		<p class="muted">Games you've played here or imported. Open one to run a full engine review.</p>
	</div>
	<span class="spacer"></span>
	<input placeholder="Filter by player or opening…" bind:value={filter} />
	<button onclick={() => download('chess-despotes-games.pgn', games.map((g) => g.pgn).join('\n'))} disabled={!games.length}>Export all</button>
	<button class="primary" onclick={() => (showImport = !showImport)}>+ Import PGN</button>
</header>

{#if showImport}
	<div class="panel stack import">
		<div class="row wrap">
			<h3>Import games</h3>
			<span class="spacer"></span>
			<label class="btn sm">Choose file… <input type="file" accept=".pgn,text/plain" hidden onchange={(e) => onFile(e.currentTarget.files?.[0])} /></label>
		</div>
		<p class="muted">Paste one or many games (e.g. a lichess or chess.com PGN export).</p>
		<textarea rows="8" bind:value={text} placeholder={'[White "Me"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 *'}></textarea>
		<div class="row wrap">
			<span class="muted">I played</span>
			<select bind:value={colorMode}>
				<option value="auto">Auto-detect{settings.playerName ? ` (“${settings.playerName}”)` : ' — set your name in Settings'}</option>
				<option value="white">White</option>
				<option value="black">Black</option>
				<option value="none">Neither / study game</option>
			</select>
			<span class="spacer"></span>
			<button class="primary" onclick={doImport} disabled={!text.trim()}>Import</button>
		</div>
	</div>
{/if}
{#if msg}<p class="msg">{msg}</p>{/if}

{#if !games.length}
	<div class="panel empty">
		<h2>No games yet</h2>
		<p class="muted">Play the engine or import a PGN to start building your archive.</p>
		<div class="row"><a class="btn primary" href="/play">Play a game</a><button onclick={() => (showImport = true)}>Import PGN</button></div>
	</div>
{:else}
	<div class="list">
		{#each shown as g (g.id)}
			<div class="game panel">
				<span class="res {outcome(g)}">{g.result.replace('1/2-1/2', '½–½')}</span>
				<div class="players">
					<span class:me={g.myColor === 'white'}><i class="dot white"></i>{g.white}</span>
					<span class:me={g.myColor === 'black'}><i class="dot black"></i>{g.black}</span>
				</div>
				<div class="info">
					<span class="op">{g.opening ?? 'Unknown opening'}</span>
					<span class="faint">{g.date || new Date(g.createdAt).toLocaleDateString()} · {Math.ceil(g.plies / 2)} moves · {g.source === 'engine' ? 'vs engine' : 'imported'}</span>
				</div>
				{#if g.review}
					<span class="acc" title="Accuracy (white / black)">{g.review.accuracy.white}% · {g.review.accuracy.black}%</span>
				{:else}
					<span class="faint small">not reviewed</span>
				{/if}
				<div class="row">
					<a class="btn sm primary" href="/analysis?game={g.id}">Analyze</a>
					<button class="sm ghost" onclick={() => download(`${g.white}-vs-${g.black}.pgn`.replace(/[^\w.-]+/g, '_'), g.pgn)} title="Download PGN">⤓</button>
					<button class="sm ghost danger" onclick={() => remove(g)} title="Delete">✕</button>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	header { margin-bottom: 20px; gap: 10px; align-items: flex-end; }
	header p { margin-top: 4px; }
	header input { width: 240px; }
	.import { margin-bottom: 20px; max-width: 860px; }
	.msg { margin-bottom: 14px; color: var(--gold-2); }
	.empty { text-align: center; padding: 48px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
	.list { display: flex; flex-direction: column; gap: 8px; }
	.game { display: grid; grid-template-columns: 56px minmax(160px, 1fr) minmax(200px, 2fr) 130px auto; align-items: center; gap: 16px; padding: 12px 16px; }
	.res { font-weight: 600; font-size: 1em; text-align: center; padding: 6px 0; background: var(--bg-2); }
	.res.win { color: var(--good); background: color-mix(in srgb, var(--good) 12%, transparent); }
	.res.loss { color: var(--bad); background: color-mix(in srgb, var(--bad) 12%, transparent); }
	.players { display: flex; flex-direction: column; gap: 2px; }
	.players span { display: flex; align-items: center; gap: 8px; color: var(--muted); }
	.players .me { color: var(--text); font-weight: 600; }
	.dot { width: 10px; height: 10px; border: 1px solid #555; display: inline-block; }
	.dot.white { background: #f1ede4; }
	.dot.black { background: #111; }
	.info { display: flex; flex-direction: column; min-width: 0; }
	.op { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.info .faint { font-size: 0.88em; }
	.acc { font-family: var(--mono); font-size: 0.88em; color: var(--gold-2); }
	.small { font-size: 0.88em; }
	@media (max-width: 900px) { .game { grid-template-columns: 56px 1fr auto; } .info, .acc, .small { display: none; } }
</style>
