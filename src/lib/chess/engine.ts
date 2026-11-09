import { turnOf } from './util';

export interface EngineLine {
	multipv: number;
	depth: number;
	/** White-POV centipawns (mate converted to ±(100000 - n)) */
	cp: number;
	mate: number | null; // white POV, + = white mates
	pv: string[];
}

export interface SearchOpts {
	depth?: number;
	movetime?: number;
	multiPv?: number;
	skill?: number; // 0-20
}

/**
 * Thin wrapper around the single-threaded Stockfish lite WASM build (~1.8 MB).
 * One search at a time; starting a new search stops the current one.
 */
export class Engine {
	private worker: Worker;
	private ready: Promise<void>;
	private queue: Promise<unknown> = Promise.resolve();
	private listener: ((line: string) => void) | null = null;
	private current: { stop: () => void } | null = null;
	private opts = { multiPv: -1, skill: -1 };
	private gen = 0;

	constructor() {
		this.worker = new Worker('/engine/stockfish-19-lite-single.js');
		this.worker.onmessage = (e) => this.listener?.(String(e.data));
		this.ready = this.waitFor('uciok', 'uci').then(() => this.waitFor('readyok', 'isready'));
	}

	private send(cmd: string) {
		this.worker.postMessage(cmd);
	}

	private waitFor(token: string, cmd: string) {
		return new Promise<void>((resolve) => {
			this.listener = (l) => {
				if (l.startsWith(token)) resolve();
			};
			this.send(cmd);
		});
	}

	stop() {
		this.current?.stop();
	}

	/** Run a search. onInfo is called with the latest set of lines (sorted by multipv). */
	search(fen: string, o: SearchOpts, onInfo?: (lines: EngineLine[]) => void): Promise<{ bestmove: string; lines: EngineLine[] }> {
		this.stop();
		const myGen = ++this.gen;
		const run = async () => {
			await this.ready;
			// A newer search was requested while this one waited in the queue: skip it.
			if (myGen !== this.gen) return { bestmove: '', lines: [] };
			const multiPv = o.multiPv ?? 1;
			const skill = o.skill ?? 20;
			if (multiPv !== this.opts.multiPv) this.send(`setoption name MultiPV value ${multiPv}`);
			if (skill !== this.opts.skill) this.send(`setoption name Skill Level value ${skill}`);
			this.opts = { multiPv, skill };
			const black = turnOf(fen) === 'black';
			const lines: EngineLine[] = [];
			return new Promise<{ bestmove: string; lines: EngineLine[] }>((resolve) => {
				this.current = { stop: () => this.send('stop') };
				this.listener = (l) => {
					if (l.startsWith('info') && l.includes(' pv ')) {
						const line = parseInfo(l, black);
						if (!line) return;
						lines[line.multipv - 1] = line;
						onInfo?.(lines.filter(Boolean));
					} else if (l.startsWith('bestmove')) {
						this.current = null;
						resolve({ bestmove: l.split(' ')[1], lines: lines.filter(Boolean) });
					}
				};
				this.send('ucinewgame');
				this.send(`position fen ${fen}`);
				this.send(o.movetime ? `go movetime ${o.movetime}${o.depth ? ` depth ${o.depth}` : ''}` : `go depth ${o.depth ?? 16}`);
			});
		};
		const p = this.queue.then(run, run);
		this.queue = p.catch(() => {});
		return p;
	}

	destroy() {
		this.worker.terminate();
	}
}

function parseInfo(l: string, black: boolean): EngineLine | null {
	const t = l.split(' ');
	const get = (k: string) => t[t.indexOf(k) + 1];
	if (t.includes('lowerbound') || t.includes('upperbound')) return null;
	const depth = +get('depth');
	const multipv = t.includes('multipv') ? +get('multipv') : 1;
	const kind = get('score');
	const val = +t[t.indexOf('score') + 2];
	const sign = black ? -1 : 1;
	let cp: number, mate: number | null = null;
	if (kind === 'mate') {
		mate = sign * val;
		cp = Math.sign(mate || (black ? 1 : -1)) * (100000 - Math.abs(val) * 100);
	} else cp = sign * val;
	return { depth, multipv, cp, mate, pv: t.slice(t.indexOf('pv') + 1) };
}

export function formatEval(line: Pick<EngineLine, 'cp' | 'mate'> | null | undefined): string {
	if (!line) return '…';
	if (line.mate !== null) return line.mate === 0 ? '#' : `${line.mate > 0 ? '' : '-'}M${Math.abs(line.mate)}`;
	const v = line.cp / 100;
	return (v > 0 ? '+' : '') + v.toFixed(1);
}

/** Play-strength presets for the lightweight engine. */
export const LEVELS = [
	{ label: 'Pawn', elo: '~800', skill: 0, depth: 1, movetime: 50 },
	{ label: 'Knight', elo: '~1100', skill: 3, depth: 3, movetime: 100 },
	{ label: 'Bishop', elo: '~1400', skill: 6, depth: 5, movetime: 150 },
	{ label: 'Rook', elo: '~1700', skill: 9, depth: 7, movetime: 250 },
	{ label: 'Queen', elo: '~2000', skill: 12, depth: 10, movetime: 400 },
	{ label: 'King', elo: '~2300', skill: 16, depth: 14, movetime: 700 },
	{ label: 'Despot', elo: '2700+', skill: 20, depth: 20, movetime: 1200 }
];
