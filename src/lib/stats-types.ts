/** Shape of GET /api/stats (shared by server and the stats page). */
export interface Stats {
	puzzles: {
		total: number;
		wins: number;
		hints: number;
		avgSeconds: number;
		rating: number | null;
		peak: number | null;
		history: { at: number; rating: number; win: boolean; puzzleRating: number }[];
		themes: { theme: string; n: number; wins: number }[];
	};
	drills: {
		total: number;
		correct: number;
		seconds: number;
		weekSeconds: number;
		streakDays: number;
		days: { day: string; seconds: number; n: number; correct: number }[];
		libs: { lib: string; name: string; n: number; correct: number; seconds: number; last: number }[];
	};
	games: {
		total: number;
		withColor: number;
		openings: { family: string; color: 'white' | 'black'; n: number; wins: number; draws: number; losses: number; accuracy: number | null }[];
	};
	vision: {
		mode: 'coords' | 'rush' | 'colors' | 'blindfold';
		variant: string;
		sessions: number;
		bestHits: number;
		bestAccuracy: number; // 0..1
		bestAvgMs: number | null;
		lastAt: number;
	}[];
}
