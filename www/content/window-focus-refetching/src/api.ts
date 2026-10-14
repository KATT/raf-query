export function getSettings() {
	return fetch("/api/settings").then((response) => response.json()) as Promise<{
		theme: string;
	}>;
}
