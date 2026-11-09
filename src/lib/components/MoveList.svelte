<script lang="ts">
	interface Move { san: string; cls?: string | null }
	interface Props {
		moves: Move[];
		ply: number; // number of moves applied (0 = start position)
		startMoveNumber?: number;
		startsWithBlack?: boolean;
		onselect?: (ply: number) => void;
	}
	let { moves, ply, startMoveNumber = 1, startsWithBlack = false, onselect }: Props = $props();
	let box: HTMLDivElement;

	const rows = $derived.by(() => {
		const out: { n: number; w?: [Move, number]; b?: [Move, number] }[] = [];
		let i = 0;
		let n = startMoveNumber;
		if (startsWithBlack && moves.length) {
			out.push({ n, b: [moves[0], 1] });
			i = 1;
			n++;
		}
		for (; i < moves.length; i += 2, n++) out.push({ n, w: [moves[i], i + 1], b: moves[i + 1] ? [moves[i + 1], i + 2] : undefined });
		return out;
	});

	const marks: Record<string, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' };

	$effect(() => {
		void ply;
		const cur = box?.querySelector<HTMLElement>('.cur');
		if (!box || !cur) return;
		// Scroll the list container only (scrollIntoView would also scroll the whole page).
		const top = cur.offsetTop; // .list is position: relative, so this is relative to the list
		if (top < box.scrollTop) box.scrollTop = top;
		else if (top + cur.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + cur.offsetHeight - box.clientHeight;
	});
</script>

{#snippet cell(m: [Move, number] | undefined)}
	{#if m}
		<button class="mv {m[0].cls ?? ''}" class:cur={m[1] === ply} onclick={() => onselect?.(m[1])}>
			{m[0].san}{#if m[0].cls && marks[m[0].cls]}<sup>{marks[m[0].cls]}</sup>{/if}
		</button>
	{:else}
		<span></span>
	{/if}
{/snippet}

<div class="list" bind:this={box}>
	{#each rows as r (r.n)}
		<span class="n">{r.n}.</span>
		{@render cell(r.w)}
		{@render cell(r.b)}
	{:else}
		<p class="faint empty">No moves yet</p>
	{/each}
</div>

<style>
	.list { position: relative; display: grid; grid-template-columns: 38px 1fr 1fr; align-content: start; max-height: 320px; overflow-y: auto; font-size: 0.88em; }
	.n { color: var(--faint); padding: 4px 8px; font-family: var(--mono); font-size: 0.88em; align-self: center; }
	.mv { background: none; border: 0; padding: 4px 8px; justify-content: flex-start; font-weight: 500; }
	.mv:hover { background: var(--panel-2) !important; }
	.mv.cur { background: color-mix(in srgb, var(--gold) 18%, transparent) !important; color: var(--gold-2); }
	.mv sup { font-size: 10px; margin-left: 2px; font-weight: 700; }
	.inaccuracy sup { color: var(--warn); }
	.mistake sup { color: var(--orange); }
	.blunder sup { color: var(--bad); }
	.mv.book { color: var(--blue); }
	.empty { grid-column: 1 / -1; padding: 8px; }
</style>
