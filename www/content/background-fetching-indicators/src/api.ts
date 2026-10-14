export interface Post {
	readonly authorId: string;
	readonly body: string;
	readonly slug: string;
	readonly title: string;
}

export async function getPost(slug: string): Promise<Post> {
	const response = await fetch(`/api/posts/${encodeURIComponent(slug)}`);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as Post;
}
