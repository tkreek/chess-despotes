<script lang="ts">
	/** Single-series columns (≤ 24px, 2px gaps) from one baseline, with per-column hover tooltip. */
	interface Col { label: string; value: number; detail?: string; tick?: string }
	let { cols, height = 160, format = (v: number) => String(v) }: { cols: Col[]; height?: number; format?: (v: number) => string } = $props();

	let w = $state(600);
	const pad = { l: 40, r: 8, t: 14, b: 22 };
	const max = $derived(Math.max(1, ...cols.map((c) => c.value)));
	const nice = $derived.by(() => {
		const raw = max / 4;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
		return { step, top: step * 4 };
	});
	const slot = $derived((w - pad.l - pad.r) / Math.max(1, cols.length));
	const bw = $derived(Math.max(2, Math.min(24, slot - 2)));
	const Y = (v: number) => pad.t + (1 - v / nice.top) * (height - pad.t - pad.b);
	let hover = $state<number | null>(null);
</script>

<div class="chart" bind:clientWidth={w}>
	<svg width={w} {height} role="img" aria-label="Column chart">
		{#each [0, 1, 2, 3, 4] as i (i)}
			<line class="grid" x1={pad.l} x2={w - pad.r} y1={Y(i * nice.step)} y2={Y(i * nice.step)} />
			<text class="tick" x={pad.l - 8} y={Y(i * nice.step) + 4} text-anchor="end">{format(i * nice.step)}</text>
		{/each}
		{#each cols as c, i (c.label)}
			{@const x = pad.l + i * slot + (slot - bw) / 2}
			{@const h = Math.max(0, height - pad.b - Y(c.value))}
			<!-- generous hit target: the whole slot -->
			<rect class="hit" x={pad.l + i * slot} y={pad.t} width={slot} height={height - pad.t - pad.b}
				onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)} role="presentation" />
			{#if c.value > 0}
				<path class="bar" class:on={hover === i}
					d="M{x},{height - pad.b} V{height - pad.b - h + Math.min(4, h)} q0,-{Math.min(4, h)} {Math.min(4, bw / 2)},-{Math.min(4, h)} H{x + bw - Math.min(4, bw / 2)} q{Math.min(4, bw / 2)},0 {Math.min(4, bw / 2)},{Math.min(4, h)} V{height - pad.b} Z" />
			{/if}
			{#if c.tick}<text class="tick" x={x + bw / 2} y={height - 6} text-anchor="middle">{c.tick}</text>{/if}
		{/each}
		<line class="base" x1={pad.l} x2={w - pad.r} y1={height - pad.b} y2={height - pad.b} />
	</svg>
	{#if hover !== null}
		{@const c = cols[hover]}
		<div class="tip" style="left:{Math.min(pad.l + hover * slot + slot, w - 200)}px">
			<b>{format(c.value)}</b> <span>{c.label}</span>
			{#if c.detail}<div class="d">{c.detail}</div>{/if}
		</div>
	{/if}
</div>

<style>
	.chart { position: relative; width: 100%; }
	svg { display: block; overflow: visible; }
	.grid { stroke: color-mix(in srgb, var(--text) 10%, transparent); stroke-width: 1; }
	.base { stroke: var(--frame); stroke-width: 1; }
	.tick { fill: var(--muted); font: 11px var(--mono); }
	.bar { fill: var(--gold); pointer-events: none; }
	.bar.on { fill: var(--gold-2); }
	.hit { fill: transparent; }
	.tip { position: absolute; top: 0; pointer-events: none; background: var(--bg-2); border: 1px solid var(--frame); padding: 4px 8px; font-size: 0.85em; white-space: nowrap; }
	.tip b { color: var(--text); }
	.tip span, .tip .d { color: var(--muted); }
</style>
