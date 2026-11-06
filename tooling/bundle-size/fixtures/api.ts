/** The one request every fixture makes, so only the imported slices differ. */
export interface Issue {
	readonly id: number;
	readonly title: string;
}

export async function getIssue(id: number): Promise<Issue> {
	const response = await fetch(`/api/issues/${id}`);
	// SAFETY: the fixtures are bundled, never run.
	return (await response.json()) as Issue;
}
