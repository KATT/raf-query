export interface Post {
	body: string;
	slug: string;
	title: string;
}

export async function listPosts(_input: {
	page: number;
	sort: "newest" | "oldest";
}): Promise<ReadonlyArray<Post>> {
	return [];
}
