<script lang="ts">
	import { onMount } from 'svelte';
	import { Chessground } from 'chessground';
	import type { Api } from 'chessground/api';
	import type { Key } from 'chessground/types';
	import type { DrawShape } from 'chessground/draw';
	import 'chessground/assets/chessground.base.css';
	import 'chessground/assets/chessground.cburnett.css';
	import { Chess } from 'chess.js';
	import { legalDests, turnOf, isCheck } from '../chess/util.ts';
	import { settings, BOARD_THEMES } from '../settings.svelte.ts';

	interface Props {
		fen: string;
		orientation?: 'white' | 'black';
		/** who may move: 'turn' = side to move, a color, or 'none' */
		movable?: 'turn' | 'white' | 'black' | 'none';
		lastMove?: [string, string] | null;
		shapes?: DrawShape[];
		highlights?: Map<Key, string>;
		onmove?: (uci: string) => void;
	}
	let { fen, orientation = 'white', movable = 'turn', lastMove = null, shapes = [], highlights, onmove }: Props = $props();

	let el: HTMLDivElement;
	let cg: Api | undefined;
	let promo = $state<{ from: Key; to: Key; color: 'white' | 'black' } | null>(null);
	const theme = $derived(BOARD_THEMES[settings.boardTheme] ?? BOARD_THEMES.walnut);

	function movableColor() {
		if (movable === 'none') return undefined;
		const t = turnOf(fen);
		if (movable === 'turn') return t;
		return movable === t ? t : undefined;
	}

	function config() {
		const color = movableColor();
		return {
			fen,
			orientation,
			turnColor: turnOf(fen),
			check: isCheck(fen) ? turnOf(fen) : false,
			lastMove: (lastMove ?? undefined) as Key[] | undefined,
			coordinates: settings.coordinates,
			highlight: { lastMove: true, check: true, custom: highlights },
			movable: { free: false, color, dests: color ? legalDests(fen) : new Map(), showDests: true },
			drawable: { autoShapes: shapes }
		} as const;
	}

	function afterMove(orig: Key, dest: Key) {
		const piece = new Chess(fen).get(orig as never);
		if (piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
			promo = { from: orig, to: dest, color: piece.color === 'w' ? 'white' : 'black' };
			return;
		}
		emit(orig + dest);
	}

	/** Re-sync the board to `fen` (e.g. after the parent rejects a move). */
	export function sync() {
		cg?.set(config());
	}

	function emit(uci: string) {
		const before = fen;
		onmove?.(uci);
		// If the parent didn't accept the move, snap the piece back.
		queueMicrotask(() => {
			if (fen === before) sync();
		});
	}

	function choosePromo(role: string | null) {
		const p = promo;
		promo = null;
		if (p && role) emit(p.from + p.to + role);
		else sync();
	}

	onMount(() => {
		cg = Chessground(el, {
			...config(),
			animation: { enabled: true, duration: 180 },
			movable: { ...config().movable, events: { after: afterMove } },
			premovable: { enabled: false },
			drawable: { enabled: true, autoShapes: shapes }
		});
		return () => cg?.destroy();
	});

	$effect(() => {
		const c = config();
		cg?.set(c);
	});

	const promoFile = $derived(promo ? promo.to.charCodeAt(0) - 97 : 0);
</script>

<div class="board" data-fen={fen} data-orientation={orientation} style="--sq-light:{theme.light};--sq-dark:{theme.dark}">
	<div class="cg" bind:this={el}></div>
	{#if promo}
		<div class="promo cg-wrap" role="dialog" aria-label="Choose promotion piece">
			<button class="scrim" aria-label="Cancel promotion" onclick={() => choosePromo(null)}></button>
			<div
				class="choices"
				style="left:{(orientation === 'white' ? promoFile : 7 - promoFile) * 12.5}%;{(promo.color === orientation) ? 'top:0' : 'bottom:0;flex-direction:column-reverse'}"
			>
				{#each ['q', 'n', 'r', 'b'] as r (r)}
					<button class="choice" onclick={() => choosePromo(r)} aria-label="Promote to {r}">
						<piece class="{promo.color} {({ q: 'queen', n: 'knight', r: 'rook', b: 'bishop' } as Record<string, string>)[r]}"></piece>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.board {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		outline: 2px solid var(--gold);
		outline-offset: 3px;
	}
	.cg { width: 100%; height: 100%; }
	.promo { position: absolute; inset: 0; z-index: 20; }
	.scrim { position: absolute; inset: 0; background: rgba(10, 10, 12, 0.55); border: 0; padding: 0; }
	.scrim:hover { background: rgba(10, 10, 12, 0.55) !important; }
	.choices { position: absolute; width: 12.5%; height: 50%; display: flex; flex-direction: column; }
	.choice {
		flex: 1; padding: 0; background: var(--bg); border: 1px solid var(--gold); position: relative;
		margin: 2px;
	}
	.choice:hover { background: color-mix(in srgb, var(--gold) 35%, var(--bg)) !important; }
	.choice piece { position: absolute; inset: 8%; width: 84%; height: 84%; background-size: cover; display: block; }
</style>
