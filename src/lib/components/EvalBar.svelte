<script lang="ts">
	import { winPct } from '../chess/util.ts';
	import { formatEval, type EngineLine } from '../chess/engine.ts';
	let { line, orientation = 'white' }: { line: EngineLine | null; orientation?: 'white' | 'black' } = $props();
	const pct = $derived(line ? (line.mate !== null ? (line.mate > 0 ? 100 : line.mate < 0 ? 0 : 50) : winPct(line.cp)) : 50);
</script>

<div class="bar" class:flip={orientation === 'black'} title="Evaluation">
	<div class="white" style="height:{pct}%"></div>
	<span class="label" class:top={pct < 50}>{line ? formatEval(line).replace('+', '') : ''}</span>
</div>

<style>
	.bar { position: relative; width: 22px; height: 100%; background: #3a3d44; overflow: hidden; display: flex; flex-direction: column-reverse; }
	.bar.flip { flex-direction: column; }
	.white { background: linear-gradient(90deg, #f4f1ea, #dcd7cc); transition: height 0.4s ease; }
	.label { position: absolute; left: 0; right: 0; bottom: 4px; text-align: center; font: 600 9.5px var(--mono); color: #222; }
	.label.top { bottom: auto; top: 4px; color: #ddd; }
	.flip .label { bottom: auto; top: 4px; }
	.flip .label.top { top: auto; bottom: 4px; }
</style>
