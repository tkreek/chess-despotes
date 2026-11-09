<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Banner from '#lib/components/Banner.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let mode = $state<'login' | 'register'>(untrack(() => (data.firstRun ? 'register' : 'login')));
	let username = $state('');
	let password = $state('');
	let confirm = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (mode === 'register' && password !== confirm) return void (error = 'Passwords do not match');
		busy = true;
		try {
			const r = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: mode, username, password })
			});
			const res = await r.json();
			if (!r.ok) throw new Error(res.error ?? 'Something went wrong');
			const next = page.url.searchParams.get('next');
			await invalidateAll();
			await goto(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<div class="wrap">
	<div class="brand">
		<Banner text="CHESS" cell={7} />
		<Banner text="DESPOTES" cell={7} />
	</div>
	<form class="panel stack" onsubmit={submit}>
		<h3>{mode === 'login' ? 'sign in' : 'create account'}</h3>
		{#if data.firstRun}<p class="muted small">Welcome! Create the first account for this machine.</p>{/if}
		<label class="stack tight">
			<span class="muted">username</span>
			<input bind:value={username} autocomplete="username" required />
		</label>
		<label class="stack tight">
			<span class="muted">password</span>
			<input type="password" bind:value={password} autocomplete={mode === 'login' ? 'current-password' : 'new-password'} required />
		</label>
		{#if mode === 'register'}
			<label class="stack tight">
				<span class="muted">confirm password</span>
				<input type="password" bind:value={confirm} autocomplete="new-password" required />
			</label>
		{/if}
		{#if error}<p class="err">! {error}</p>{/if}
		<button class="primary go" disabled={busy}>{busy ? '…' : mode === 'login' ? 'sign in' : 'create account'}</button>
		<button type="button" class="ghost sm switch" onclick={() => ((mode = mode === 'login' ? 'register' : 'login'), (error = ''))}>
			{mode === 'login' ? 'new here? create an account' : 'have an account? sign in'}
		</button>
	</form>
	<p class="faint small">Accounts are local to this machine. Data is stored in SQLite.</p>
</div>

<style>
	.wrap { min-height: calc(100vh - 80px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
	.brand { display: flex; flex-direction: column; gap: 8px; align-items: center; }
	form { width: min(360px, 100%); padding-top: 18px; }
	.tight { gap: 4px; }
	.go { justify-content: center; padding: 8px; }
	.switch { align-self: center; color: var(--muted); }
	.err { color: var(--bad); }
	.small { font-size: 0.86em; }
</style>
