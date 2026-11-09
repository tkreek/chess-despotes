/**
 * Reads the active Omarchy theme for /omarchy-theme.json so the app can follow it. Omarchy keeps the applied theme in
 * ~/.local/state/omarchy/current/theme/colors.toml; `theme.generation` changes on every switch.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STATE = process.env.OMARCHY_THEME_STATE ?? join(homedir(), '.local/state/omarchy/current');

function parseToml(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split('\n')) {
		const m = line.match(/^\s*([\w-]+)\s*=\s*"([^"]*)"/);
		if (m) out[m[1]] = m[2];
	}
	return out;
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8').trim() : '');

let fontCache: { gen: string; font: string } | null = null;
function monoFont(gen: string) {
	if (fontCache?.gen === gen) return fontCache.font;
	let font = '';
	try {
		font = execFileSync('fc-match', ['monospace', '-f', '%{family}'], { timeout: 1500 }).toString().split(',')[0].trim();
	} catch {
		/* fontconfig unavailable */
	}
	fontCache = { gen, font };
	return font;
}

export function themePayload() {
	const colorsPath = join(STATE, 'theme/colors.toml');
	if (!existsSync(colorsPath)) return null;
	const generation = read(join(STATE, 'theme.generation'));
	const shell = read(join(STATE, 'theme/shell.toml'));
	const baseSize = Number(shell.match(/\[font\][^[]*?base-size\s*=\s*([\d.]+)/)?.[1] ?? 0);
	return {
		baseSize,
		name: read(join(STATE, 'theme.name')),
		generation,
		colors: parseToml(readFileSync(colorsPath, 'utf8')),
		font: monoFont(generation)
	};
}

