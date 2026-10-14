export interface Post {
	readonly body: string;
	readonly slug: string;
	readonly title: string;
}

export interface PostComment {
	readonly author: string;
	readonly body: string;
	readonly id: string;
}

export interface Issue {
	readonly id: number;
	readonly title: string;
}

async function request<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return (await response.json()) as T;
}

export function getPost(slug: string) {
	return request<Post>(`/api/posts/${slug}`);
}

export function listComments(slug: string) {
	return request<Array<PostComment>>(`/api/posts/${slug}/comments`);
}

export function listIssues(input: { status: "open" | "done" }) {
	return request<Array<Issue>>(`/api/issues?status=${input.status}`);
}
