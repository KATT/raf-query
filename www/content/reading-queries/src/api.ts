export interface Post {
	body: string;
	slug: string;
	title: string;
}

export interface PostComment {
	author: string;
	body: string;
	id: string;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${slug}`);
}

export function listComments(slug: string) {
	return request<Array<PostComment>>(`/api/posts/${slug}/comments`);
}
