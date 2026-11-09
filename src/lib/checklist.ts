import { kvGet, kvSet } from './db.ts';

/**
 * Openings checklist: the lichess named-openings catalog (CC0) arranged as
 * Opening → Variation → Sub-variation (names look like "Family: Variation, Sub, Sub-sub").
 * Ticks are manual and independent of drilling.
 */

export interface Line {
	eco: string;
	pgn: string;
	uci: string;
}

export interface CNode {
	key: string; // full name, e.g. "Caro-Kann Defense: Advance Variation, Short Variation"
	label: string; // last segment, e.g. "Short Variation"
	depth: number;
	lines: Line[]; // usually one; a few names have several move orders
	children: CNode[];
	/** every key in this subtree, including itself */
	all: string[];
	eco: string; // e.g. "B12" or "B12–B19"
}

function keyOf(family: string, rest: string[]) {
	return rest.length ? `${family}: ${rest.join(', ')}` : family;
}

let cache: Promise<CNode[]> | null = null;

export function loadCatalog(): Promise<CNode[]> {
	cache ??= fetch('/data/openings.json')
		.then((r) => r.json() as Promise<[string, string, string, string][]>)
		.then(build);
	return cache;
}

function build(rows: [string, string, string, string][]): CNode[] {
	const byKey = new Map<string, CNode>();
	const roots: CNode[] = [];

	const get = (family: string, rest: string[]): CNode => {
		const key = keyOf(family, rest);
		let n = byKey.get(key);
		if (n) return n;
		n = { key, label: rest.at(-1) ?? family, depth: rest.length, lines: [], children: [], all: [], eco: '' };
		byKey.set(key, n);
		if (rest.length) get(family, rest.slice(0, -1)).children.push(n);
		else roots.push(n);
		return n;
	};

	for (const [eco, name, pgn, uci] of rows) {
		const i = name.indexOf(': ');
		const family = i < 0 ? name : name.slice(0, i);
		const rest = i < 0 ? [] : name.slice(i + 2).split(', ');
		get(family, rest).lines.push({ eco, pgn, uci });
	}

	const finish = (n: CNode): void => {
		n.children.sort((a, b) => a.label.localeCompare(b.label));
		n.children.forEach(finish);
		n.all = [n.key, ...n.children.flatMap((c) => c.all)];
		const ecos = [...n.lines.map((l) => l.eco), ...n.children.map((c) => c.eco).flatMap((e) => e.split('–'))].filter(Boolean).sort();
		n.eco = !ecos.length ? '' : ecos[0] === ecos.at(-1) ? ecos[0] : `${ecos[0]}–${ecos.at(-1)}`;
	};
	roots.sort((a, b) => a.label.localeCompare(b.label));
	roots.forEach(finish);
	return roots;
}

export interface ChecklistState {
	checked: string[];
	updatedAt: number;
}

export const loadChecked = async () => new Set((await kvGet<ChecklistState>('checklist', { checked: [], updatedAt: 0 })).checked);
export const saveChecked = (s: Set<string>) => kvSet('checklist', { checked: [...s], updatedAt: Date.now() } satisfies ChecklistState);
