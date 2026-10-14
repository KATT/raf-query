export async function listIssues(): Promise<Array<{ id: number }>> {
	const response = await fetch("/api/issues");
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return (await response.json()) as Array<{ id: number }>;
}
