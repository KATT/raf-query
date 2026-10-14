export interface Post {
	body: string;
	slug: string;
	title: string;
}

export interface Author {
	id: string;
	name: string;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${slug}`);
}

export function getAuthor(id: string) {
	return request<Author>(`/api/authors/${id}`);
}
