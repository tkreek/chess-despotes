<script lang="ts">
	import { winPct } from '../chess/util.ts';
	interface Props {
		evals: number[];
		classes?: (string | null)[];
		ply: number;
		onselect?: (ply: number) => void;
	}
	let { evals, classes = [], ply, onselect }: Props = $props();
	const W = 600, H = 110;
	const x = (i: number) => (evals.length > 1 ? (i / (evals.length - 1)) * W : 0);
	const y = (cp: number) => H - (winPct(cp) / 100) * H;
	const path = $derived(evals.map((e, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(e).toFixed(1)}`).join(''));
	const color: Record<string, string> = { inaccuracy: 'var(--warn)', mistake: 'var(--orange)', blunder: 'var(--bad)' };

	function click(e: MouseEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const i = Math.round(((e.clientX - r.left) / r.width) * (evals.length - 1));
		onselect?.(Math.max(0, Math.min(evals.length - 1, i)));
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" onclick={click} role="img" aria-label="Evaluation graph">
	<rect width={W} height={H} fill="var(--bg-2)" />
	{#if evals.length > 1}
		<path d="{path}L{W},{H}L0,{H}Z" fill="var(--text)" />
		<line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(120,120,120,0.5)" stroke-dasharray="4 4" />
		{#each classes as c, i (i)}
			{#if c && color[c]}
				<circle cx={x(i + 1)} cy={y(evals[i + 1])} r="4" fill={color[c]} stroke="#111" stroke-width="1" vector-effect="non-scaling-stroke" />
			{/if}
		{/each}
		<line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="var(--gold)" stroke-width="2" vector-effect="non-scaling-stroke" />
	{/if}
</svg>

<style>
	svg { width: 100%; height: 110px; cursor: pointer; display: block; }
</style>
