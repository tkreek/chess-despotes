<script lang="ts">
	/** Single-series line (2px) with a faint area wash, end label, and crosshair + tooltip on hover. */
	interface Point { x: number; y: number; label: string; detail?: string }
	let { points, height = 180, format = (v: number) => String(Math.round(v)) }: { points: Point[]; height?: number; format?: (v: number) => string } = $props();

	let w = $state(600);
	const pad = { l: 44, r: 52, t: 12, b: 22 };
	const ys = $derived(points.map((p) => p.y));
	const domain = $derived.by(() => {
		if (!ys.length) return [0, 1];
		const lo = Math.min(...ys), hi = Math.max(...ys);
		const step = hi - lo > 400 ? 200 : hi - lo > 150 ? 100 : 50;
		return [Math.floor((lo - 10) / step) * step, Math.ceil((hi + 10) / step) * step];
	});
	const ticks = $derived.by(() => {
		const [a, b] = domain;
		const n = 4, step = (b - a) / n;
		return Array.from({ length: n + 1 }, (_, i) => a + i * step);
	});
	const X = (i: number) => pad.l + (points.length > 1 ? (i / (points.length - 1)) * (w - pad.l - pad.r) : (w - pad.l - pad.r) / 2);
	const Y = (v: number) => pad.t + (1 - (v - domain[0]) / (domain[1] - domain[0] || 1)) * (height - pad.t - pad.b);
	const path = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(''));
	const area = $derived(points.length ? `${path}L${X(points.length - 1)},${height - pad.b}L${X(0)},${height - pad.b}Z` : '');

	let hover = $state<number | null>(null);
	function move(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const x = e.clientX - r.left;
		const i = Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (points.length - 1));
		hover = points.length ? Math.max(0, Math.min(points.length - 1, i)) : null;
	}
	const last = $derived(points.at(-1));
</script>

<div class="chart" bind:clientWidth={w}>
	<svg width={w} {height} role="img" aria-label="Line chart" onpointermove={move} onpointerleave={() => (hover = null)}>
		{#each ticks as t (t)}
			<line class="grid" x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} />
			<text class="tick" x={pad.l - 8} y={Y(t) + 4} text-anchor="end">{format(t)}</text>
		{/each}
		{#if points.length}
			<path class="area" d={area} />
			<path class="line" d={path} />
			{#if last}
				<circle class="dot" cx={X(points.length - 1)} cy={Y(last.y)} r="4" />
				<text class="end" x={X(points.length - 1) + 9} y={Y(last.y) + 4}>{format(last.y)}</text>
			{/if}
			{#if hover !== null}
				<line class="cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={height - pad.b} />
				<circle class="dot" cx={X(hover)} cy={Y(points[hover].y)} r="4" />
			{/if}
		{/if}
	</svg>
	{#if hover !== null && points[hover]}
		<div class="tip" style="left:{Math.min(X(hover) + 10, w - 190)}px">
			<b>{format(points[hover].y)}</b> <span>{points[hover].label}</span>
			{#if points[hover].detail}<div class="d">{points[hover].detail}</div>{/if}
		</div>
	{/if}
</div>

<style>
	.chart { position: relative; width: 100%; }
	svg { display: block; overflow: visible; }
	.grid { stroke: color-mix(in srgb, var(--text) 10%, transparent); stroke-width: 1; }
	.tick, .end { fill: var(--muted); font: 11px var(--mono); }
	.end { fill: var(--text); font-weight: 700; }
	.line { fill: none; stroke: var(--gold); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
	.area { fill: var(--gold); opacity: 0.1; }
	.dot { fill: var(--gold); stroke: var(--bg); stroke-width: 2; }
	.cross { stroke: var(--frame); stroke-width: 1; }
	.tip { position: absolute; top: 0; pointer-events: none; background: var(--bg-2); border: 1px solid var(--frame); padding: 4px 8px; font-size: 0.85em; white-space: nowrap; }
	.tip b { color: var(--text); }
	.tip span, .tip .d { color: var(--muted); }
</style>
