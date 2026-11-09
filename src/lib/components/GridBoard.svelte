<script lang="ts">
	/** Plain 8×8 board (no pieces) for vision drills: every square is clickable and can flash a state. */
	import { settings, BOARD_THEMES } from '../settings.svelte.ts';

	interface Props {
		orientation?: 'white' | 'black';
		coordinates?: boolean;
		flashes?: Record<string, 'good' | 'bad' | 'target'>;
		disabled?: boolean;
		onpick?: (square: string) => void;
	}
	let { orientation = 'white', coordinates = false, flashes = {}, disabled = false, onpick }: Props = $props();

	const theme = $derived(BOARD_THEMES[settings.boardTheme] ?? BOARD_THEMES.walnut);
	const files = $derived(orientation === 'white' ? 'abcdefgh' : 'hgfedcba');
	const ranks = $derived(orientation === 'white' ? '87654321' : '12345678');
	const squares = $derived([...ranks].flatMap((r) => [...files].map((f) => f + r)));
	const isLight = (sq: string) => (sq.charCodeAt(0) - 97 + +sq[1]) % 2 === 0;
</script>

<div class="grid" class:disabled style="--sq-light:{theme.light};--sq-dark:{theme.dark}">
	{#each squares as sq, i (sq)}
		<button
			class="sq {isLight(sq) ? 'light' : 'dark'} {flashes[sq] ?? ''}"
			onpointerdown={(e) => { e.preventDefault(); if (!disabled) onpick?.(sq); }}
			aria-label={sq}
			tabindex="-1"
		>
			{#if coordinates && i % 8 === 0}<span class="rk">{sq[1]}</span>{/if}
			{#if coordinates && i >= 56}<span class="fl">{sq[0]}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.grid {
		display: grid; grid-template-columns: repeat(8, 1fr); aspect-ratio: 1; width: 100%;
		outline: 2px solid var(--gold); outline-offset: 3px; user-select: none; touch-action: manipulation;
	}
	.sq { position: relative; border: 0; padding: 0; margin: 0; cursor: pointer; transition: background-color 0.12s; }
	.sq.light { background: var(--sq-light); }
	.sq.dark { background: var(--sq-dark); }
	.sq:hover { filter: brightness(1.06); background-image: none; }
	.disabled .sq { cursor: default; }
	.sq.good { background: color-mix(in srgb, var(--good) 75%, var(--sq-light)) !important; }
	.sq.bad { background: color-mix(in srgb, var(--bad) 75%, var(--sq-light)) !important; }
	.sq.target { box-shadow: inset 0 0 0 4px var(--good); }
	.rk, .fl { position: absolute; font: 700 10px var(--mono); pointer-events: none; }
	.rk { top: 3px; left: 4px; }
	.fl { bottom: 2px; right: 4px; }
	.light .rk, .light .fl { color: var(--sq-dark); }
	.dark .rk, .dark .fl { color: var(--sq-light); }
</style>
