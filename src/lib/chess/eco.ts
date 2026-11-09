import { epd } from './util';

let table: Record<string, [string, string]> | null = null;
let loading: Promise<void> | null = null;

export function loadEco() {
	loading ??= fetch('/data/eco.json')
		.then((r) => r.json())
		.then((t) => void (table = t));
	return loading;
}

/** Deepest named opening along a sequence of FENs. */
export function openingName(fens: string[]): { eco: string; name: string } | null {
	if (!table) return null;
	for (let i = fens.length - 1; i >= 0; i--) {
		const hit = table[epd(fens[i])];
		if (hit) return { eco: hit[0], name: hit[1] };
	}
	return null;
}
