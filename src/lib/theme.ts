/**
 * Follows the active Omarchy theme. The dev/preview server exposes it at /omarchy-theme.json
 * (see omarchy-theme.ts); we map its palette onto the app's CSS tokens and poll for changes,
 * so `omarchy theme set …` restyles the app live. Without the endpoint the built-in palette is used.
 */
type Colors = Record<string, string>;
interface Payload { name: string; generation: string; colors: Colors; font: string; baseSize?: number }

const CACHE_KEY = 'cd-omarchy-theme';
let lastGen = '';
let timer: ReturnType<typeof setInterval> | null = null;
export const themeInfo = { name: '', available: false };

function luminance(hex: string) {
	const m = hex.replace('#', '').match(/.{2}/g);
	if (!m) return 0;
	const [r, g, b] = m.map((x) => {
		const c = parseInt(x, 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const mix = (a: string, b: string, pct: number) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

function tokens(c: Colors, font: string, baseSize = 0): Record<string, string> {
	const light = c.mode === 'light' || (c.background ? luminance(c.background) > 0.4 : false);
	const fg = c.foreground ?? (light ? '#222222' : '#e6e6e6');
	const bg = c.background ?? (light ? '#ffffff' : '#1a1a1a');
	const accent = c.accent ?? c.blue ?? '#d6a84e';
	const panel = light ? (c.dark_background ?? mix(bg, fg, 94)) : bg;
	const t: Record<string, string> = {
		'color-scheme': light ? 'light' : 'dark',
		// Omarchy windows sit on the theme's main background; insets use the darker shade.
		'--bg': bg,
		'--bg-2': light ? mix(bg, fg, 95) : (c.dark_background ?? mix(bg, '#000', 80)),
		'--panel': panel,
		'--panel-2': c.lighter_background && !light ? c.lighter_background : mix(panel, fg, 90),
		'--line': c.selection ?? mix(bg, fg, 82),
		'--line-strong': mix(c.selection ?? bg, fg, 80),
		'--hover': mix(c.lighter_background ?? panel, fg, 92),
		'--text': fg,
		'--muted': c.light_foreground && !light ? c.light_foreground : mix(fg, bg, 70),
		'--faint': c.muted ?? c.dark_foreground ?? mix(fg, bg, 45),
		'--gold': accent,
		'--gold-2': c.bright_blue && c.blue === accent ? c.bright_blue : mix(accent, light ? '#000' : '#fff', 80),
		'--on-accent': luminance(accent) > 0.35 ? (c.darker_background && !light ? c.darker_background : '#111111') : '#ffffff',
		'--good': c.green ?? '#6fbf73',
		'--bad': c.red ?? '#e0675a',
		'--warn': c.yellow ?? '#e2b04a',
		'--orange': c.orange ?? '#e8894a',
		'--blue': c.cyan ?? c.blue ?? '#6fa8dc',
		// Board squares derived from the palette
		'--board-light': light ? mix(bg, accent, 90) : mix(fg, accent, 86),
		'--board-dark': light ? mix(accent, bg, 50) : mix(accent, c.lighter_background ?? bg, 55)
	};
	if (font) t['--mono'] = `'${font}', 'JetBrainsMono Nerd Font', ui-monospace, monospace`;
	// Omarchy's shell font base-size is in points (12pt ≈ 16px); keep the app a touch denser.
	if (baseSize) t['--fs'] = `${Math.round(baseSize * 1.17)}px`;
	return t;
}

function apply(p: Payload | null) {
	const root = document.documentElement;
	const keys = ['color-scheme', '--bg', '--bg-2', '--panel', '--panel-2', '--line', '--line-strong', '--hover', '--text', '--muted', '--faint', '--gold', '--gold-2', '--on-accent', '--good', '--bad', '--warn', '--orange', '--blue', '--board-light', '--board-dark', '--mono', '--fs'];
	for (const k of keys) root.style.removeProperty(k);
	themeInfo.available = !!p;
	themeInfo.name = p?.name ?? '';
	if (!p) return;
	for (const [k, v] of Object.entries(tokens(p.colors, p.font, p.baseSize))) root.style.setProperty(k, v);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.colors.background ?? '#121317');
}

async function poll() {
	try {
		const r = await fetch('/omarchy-theme.json', { cache: 'no-store' });
		if (!r.ok || !r.headers.get('content-type')?.includes('json')) return;
		const p = (await r.json()) as Payload;
		if (p.generation === lastGen) return;
		lastGen = p.generation;
		apply(p);
		try {
			localStorage.setItem(CACHE_KEY, JSON.stringify(p));
		} catch {
			/* ignore */
		}
	} catch {
		/* server without the theme endpoint (e.g. a static host) */
	}
}

/** Start or stop following the Omarchy theme. */
export function followOmarchy(on: boolean) {
	if (timer) clearInterval(timer);
	timer = null;
	lastGen = '';
	if (!on) return apply(null);
	// Apply the last known theme immediately to avoid a flash, then refresh.
	try {
		const cached = localStorage.getItem(CACHE_KEY);
		if (cached) apply(JSON.parse(cached));
	} catch {
		/* ignore */
	}
	poll();
	timer = setInterval(poll, 2000);
}
