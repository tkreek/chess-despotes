export const BOARD_THEMES = {
	omarchy: { name: 'Omarchy', light: 'var(--board-light)', dark: 'var(--board-dark)' },
	walnut: { name: 'Walnut', light: '#ecd9b9', dark: '#ae8a68' },
	slate: { name: 'Slate', light: '#dee3e6', dark: '#8ca2ad' },
	moss: { name: 'Moss', light: '#e9edcc', dark: '#779954' },
	dusk: { name: 'Dusk', light: '#d9d3e8', dark: '#8b7aa8' },
	ink: { name: 'Ink', light: '#c8ccd2', dark: '#59636f' }
} as const;
export type BoardTheme = keyof typeof BOARD_THEMES;

interface Settings {
	boardTheme: BoardTheme;
	coordinates: boolean;
	analysisDepth: number;
	reviewDepth: number;
	playerName: string;
	showEngineInExplore: boolean;
	followOmarchy: boolean;
}

const defaults: Settings = {
	boardTheme: 'omarchy',
	coordinates: true,
	analysisDepth: 18,
	reviewDepth: 12,
	playerName: '',
	showEngineInExplore: false,
	followOmarchy: true
};

function load(): Settings {
	try {
		return { ...defaults, ...JSON.parse(localStorage.getItem('cd-settings') ?? '{}') };
	} catch {
		return defaults;
	}
}

export const settings = $state<Settings>(typeof localStorage === 'undefined' ? defaults : load());

export function saveSettings() {
	try {
		localStorage.setItem('cd-settings', JSON.stringify(settings));
	} catch {
		/* storage unavailable */
	}
}

// Persist automatically whenever any setting changes.
if (typeof window !== 'undefined') {
	$effect.root(() => {
		$effect(() => {
			JSON.stringify(settings);
			saveSettings();
		});
	});
}
