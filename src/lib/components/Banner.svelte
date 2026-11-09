<script lang="ts">
	// Tiny 5-row block font for the home banner (only the letters we need).
	const G: Record<string, string[]> = {
		C: [' ███', '█   ', '█   ', '█   ', ' ███'],
		H: ['█  █', '█  █', '████', '█  █', '█  █'],
		E: ['████', '█   ', '███ ', '█   ', '████'],
		S: [' ███', '█   ', ' ██ ', '   █', '███ '],
		D: ['███ ', '█  █', '█  █', '█  █', '███ '],
		P: ['███ ', '█  █', '███ ', '█   ', '█   '],
		O: [' ██ ', '█  █', '█  █', '█  █', ' ██ '],
		T: ['███', ' █ ', ' █ ', ' █ ', ' █ '],
		' ': ['  ', '  ', '  ', '  ', '  ']
	};
	let { text, cell = 7 }: { text: string; cell?: number } = $props();
	// Lay glyphs out on a grid and draw each filled cell as a rect (font-independent, crisp).
	const layout = $derived.by(() => {
		const cells: [number, number][] = [];
		let x = 0;
		for (const ch of text.toUpperCase()) {
			const g = G[ch] ?? G[' '];
			g.forEach((row, y) => [...row].forEach((c, i) => c !== ' ' && cells.push([x + i, y])));
			x += g[0].length + 1;
		}
		return { cells, w: x - 1 };
	});
</script>

<svg viewBox="0 0 {layout.w * cell} {5 * cell}" width={layout.w * cell} height={5 * cell} role="img" aria-label={text}>
	{#each layout.cells as [x, y] (`${x},${y}`)}
		<rect x={x * cell} y={y * cell} width={cell - 1} height={cell - 1} />
	{/each}
</svg>

<style>
	svg { display: block; max-width: 100%; height: auto; fill: var(--gold); shape-rendering: crispEdges; }
</style>
