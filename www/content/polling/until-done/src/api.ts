export interface Build {
	readonly id: string;
	readonly status: "pending" | "running" | "done" | "failed";
}

export async function getBuild(id: string): Promise<Build> {
	const response = await fetch(`/api/builds/${encodeURIComponent(id)}`);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as Build;
}
