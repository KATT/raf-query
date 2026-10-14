export interface PostComment {
	body: string;
	id: string;
}

export interface User {
	id: string;
	name: string;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as T;
}

export function listComments(slug: string) {
	return request<Array<PostComment>>(`/api/posts/${slug}/comments`);
}

export function getMe() {
	return request<User>("/api/me");
}
