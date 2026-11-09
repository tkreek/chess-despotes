/** Fire-and-forget analytics events (stored in SQLite; see /stats). */
export function track(event: { type: 'puzzle' | 'drill' | 'vision' } & Record<string, unknown>) {
	fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event), keepalive: true }).catch(() => {});
}
