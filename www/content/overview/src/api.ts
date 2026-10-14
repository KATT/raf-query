export interface Post {
	body: string;
	slug: string;
	title: string;
}

export async function getPost(slug: string) {
	const response = await fetch(`/api/posts/${slug}`);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as Post;
}
