<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Engine, formatEval, type EngineLine } from '../chess/engine.ts';
	import { pvToSan, gameStatus } from '../chess/util.ts';
	import { settings } from '../settings.svelte.ts';

	interface Props {
		fen: string;
		enabled?: boolean;
		lines?: EngineLine[];
		onplay?: (uci: string) => void;
	}
	let { fen, enabled = $bindable(true), lines = $bindable([]), onplay }: Props = $props();

	let engine: Engine | null = null;
	let timer: ReturnType<typeof setTimeout>;

	$effect(() => {
		const f = fen;
		const on = enabled;
		const depth = settings.analysisDepth;
		clearTimeout(timer);
		lines = [];
		if (!on) {
			engine?.stop();
			return;
		}
		if (gameStatus(f)) return;
		timer = setTimeout(() => {
			engine ??= new Engine();
			engine.search(f, { depth, multiPv: 3 }, (ls) => {
				if (f === fen) lines = ls.map((l) => ({ ...l }));
			});
		}, 120);
	});

	onDestroy(() => {
		clearTimeout(timer);
		engine?.destroy();
	});
</script>

<div class="engine">
	<div class="head">
		<label class="switch">
			<input type="checkbox" bind:checked={enabled} />
			<span></span>
		</label>
		<b class="eval mono">{enabled ? formatEval(lines[0]) : '—'}</b>
		<span class="faint">{enabled ? (lines[0] ? `depth ${lines[0].depth}/${settings.analysisDepth}` : 'thinking…') : 'engine off'}</span>
	</div>
	{#if enabled}
		<!-- Always render every slot so the panel's height never changes while lines stream in. -->
		<div class="lines">
			{#each [0, 1, 2] as i (i)}
				{@const l = lines[i]}
				{#if l}
					<button class="line ghost" onclick={() => onplay?.(l.pv[0])} title="Play this move">
						<span class="mono score">{formatEval(l)}</span>
						<span class="pv">{pvToSan(fen, l.pv, 12)}</span>
					</button>
				{:else}
					<div class="line empty"><span class="score faint">···</span><span class="pv faint">&nbsp;</span></div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.engine { border: 1px solid var(--line); background: var(--bg-2); overflow: hidden; contain: inline-size; min-width: 0; }
	.head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; }
	.eval { font-size: 1.2em; width: 7ch; flex: none; }
	.lines { border-top: 1px solid var(--line); }
	.line { display: flex; width: 100%; min-width: 0; height: 2.2em; gap: 10px; align-items: center; justify-content: flex-start; padding: 0 12px; text-align: left; overflow: hidden; }
	.line + .line { border-top: 1px solid var(--line); }
	.score { color: var(--gold-2); width: 6ch; flex: none; font-size: 0.88em; }
	.pv { flex: 1; min-width: 0; color: var(--muted); font-size: 0.88em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.switch { position: relative; width: 34px; height: 20px; flex: none; cursor: pointer; }
	.switch input { opacity: 0; width: 0; height: 0; }
	.switch span { position: absolute; inset: 0; background: var(--panel-2); border: 1px solid var(--line); transition: 0.2s; }
	.switch span::after { content: ''; position: absolute; width: 14px; height: 14px; left: 2px; top: 2px; background: var(--muted); transition: 0.2s; }
	.switch input:checked + span { background: color-mix(in srgb, var(--gold) 25%, transparent); border-color: var(--gold); }
	.switch input:checked + span::after { transform: translateX(14px); background: var(--gold-2); }
</style>
