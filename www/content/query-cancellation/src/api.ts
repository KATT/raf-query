export interface Post {
	readonly slug: string;
	readonly title: string;
}

export async function searchPosts(input: {
	readonly q: string;
	readonly signal?: AbortSignal;
}): Promise<ReadonlyArray<Post>> {
	const response = await fetch(`/api/search?q=${encodeURIComponent(input.q)}`, {
		signal: input.signal,
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as ReadonlyArray<Post>;
}
