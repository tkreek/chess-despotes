<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { settings } from '#lib/settings.svelte.ts';
	import { followOmarchy, themeInfo } from '#lib/theme.ts';
	import { migrateBrowserData } from '#lib/migrate.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const bare = $derived(page.url.pathname === '/login');

	async function logout() {
		await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
		location.href = '/login';
	}

	// Inherit colors + font from the active Omarchy theme (live) unless turned off in Settings.
	$effect(() => followOmarchy(settings.followOmarchy));

	const nav = [
		{ href: '/', label: 'home', glyph: '⌂' },
		{ href: '/openings', label: 'openings', glyph: '♘' },
		{ href: '/checklist', label: 'checklist', glyph: '✓' },
		{ href: '/puzzles', label: 'puzzles', glyph: '✦' },
		{ href: '/play', label: 'play', glyph: '♙' },
		{ href: '/vision', label: 'vision', glyph: '◎' },
		{ href: '/games', label: 'games', glyph: '≡' },
		{ href: '/analysis', label: 'analysis', glyph: '∿' },
		{ href: '/stats', label: 'stats', glyph: '%' },
		{ href: '/settings', label: 'settings', glyph: '∗' }
	];
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
	const current = $derived(nav.find((n) => active(n.href))?.label ?? '');

	let themeName = $state('');
	let notice = $state<string | null>(null);
	$effect(() => {
		if (data.user) migrateBrowserData().then((m) => (notice = m));
	});
	onMount(() => {
		const tick = () => {
			themeName = settings.followOmarchy && themeInfo.available ? themeInfo.name : 'despotes';
		};
		tick();
		const t = setInterval(tick, 1000);
		return () => clearInterval(t);
	});

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
		// 1–9 jump to the first nine sections, 0 to the tenth
		const i = e.key === '0' ? 9 : +e.key - 1;
		if (/^[0-9]$/.test(e.key) && i < nav.length) {
			e.preventDefault();
			goto(nav[i].href);
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<svelte:window onkeydown={onKey} />

{#if bare}
	<main class="bare">{@render children()}</main>
{:else}
<div class="shell">
	<aside>
		<a class="brand" href="/">
			<span class="mark" aria-hidden="true">
				<svg viewBox="0 0 64 64" width="20" height="20"><path d="M10 48h44l-4-26-10 11-8-19-8 19-10-11z" /><rect x="10" y="51" width="44" height="6" /></svg>
			</span>
			<span>chess<b>despotes</b></span>
		</a>
		<nav>
			{#each nav as n, i (n.href)}
				<a href={n.href} class:active={active(n.href)}>
					<span class="glyph">{n.glyph}</span>
					<span class="label">{n.label}</span>
					<kbd>{(i + 1) % 10}</kbd>
				</a>
			{/each}
		</nav>
		{#if data.user}
			<div class="account">
				<span class="who">@{data.user.username}</span>
				<button class="sm ghost" onclick={logout}>sign out</button>
			</div>
		{/if}
	</aside>
	<main>
		{#if notice}<div class="notice row"><span>✓ {notice}</span><span class="spacer"></span><button class="sm ghost" onclick={() => (notice = null)}>✕</button></div>{/if}
		{@render children()}
	</main>
	<footer class="status">
		<span class="seg accent">CHESS DESPOTES</span>
		<span class="seg">{current}</span>
		<span class="hint">0-9 navigate · ←/→ moves · f flip</span>
		<span class="spacer"></span>
		{#if data.user}<span class="seg">@{data.user.username}</span>{/if}
		<span class="seg">sf19-lite</span>
		<span class="seg">theme:{themeName}</span>
	</footer>
</div>
{/if}

<style>
	.shell { display: grid; grid-template-columns: 200px 1fr; grid-template-rows: 1fr auto; min-height: 100vh; }
	aside {
		position: sticky; top: 0; height: calc(100vh - 24px); display: flex; flex-direction: column; gap: 18px;
		padding: 18px 10px; border-right: 1px solid var(--frame);
	}
	.brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; font-weight: 400; }
	.brand b { color: var(--gold); font-weight: 700; }
	.mark {
		display: grid; place-items: center; width: 28px; height: 28px; font-size: 1.2em;
		color: var(--on-accent); background: var(--gold);
	}
	.mark svg { fill: currentColor; }
	nav { display: flex; flex-direction: column; gap: 1px; }
	nav a { display: flex; align-items: center; gap: 10px; padding: 5px 8px; color: var(--muted); border: 1px solid transparent; }
	nav a:hover { background: var(--c-hover); color: var(--text); }
	nav a.active { background: var(--c-hover); border-color: color-mix(in srgb, var(--text) 25%, transparent); color: var(--gold); }
	.glyph { width: 1.2em; text-align: center; }
	.label { flex: 1; }
	kbd { font: inherit; font-size: 0.8em; color: var(--faint); }
	nav a.active kbd { color: var(--gold); }
	main { padding: 22px 28px 40px; min-width: 0; }
	.status {
		grid-column: 1 / -1; position: sticky; bottom: 0; z-index: 30; height: 24px;
		display: flex; align-items: stretch; gap: 1px; font-size: 0.86em; line-height: 24px;
		background: var(--bg-2); border-top: 1px solid var(--frame); white-space: nowrap; overflow: hidden;
	}
	.seg { padding: 0 10px; background: var(--c-hover); }
	.seg.accent { background: var(--gold); color: var(--on-accent); font-weight: 700; }
	.hint { padding: 0 12px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; }
	.spacer { flex: 1; }
	.account { margin-top: auto; display: flex; align-items: center; gap: 6px; padding: 0 8px; font-size: 0.88em; }
	.who { color: var(--gold); flex: 1; overflow: hidden; text-overflow: ellipsis; }
	main.bare { padding: 24px; }
	.notice { border: 1px solid var(--good); color: var(--good); padding: 6px 10px; margin-bottom: 16px; }
	@media (max-width: 800px) {
		.shell { grid-template-columns: 1fr; }
		aside { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; padding: 10px 16px; border-right: 0; border-bottom: 1px solid var(--frame); }
		nav { flex-direction: row; flex-wrap: wrap; }
		kbd, .hint { display: none; }
		main { padding: 16px; }
	}
</style>
