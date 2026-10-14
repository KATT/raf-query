export interface Post {
	authorId: string;
	body: string;
	slug: string;
	title: string;
}

export interface Author {
	id: string;
	name: string;
}

export interface Org {
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

export function listComments(slug: string) {
	return request<Array<{ body: string }>>(`/api/posts/${slug}/comments`);
}

export function getAuthor(id: string) {
	return request<Author>(`/api/authors/${id}`);
}

export function getCurrentUser() {
	return request<{ orgId: string }>("/api/me");
}

export function getOrg(input: { orgId: string }) {
	return request<Org>(`/api/orgs/${input.orgId}`);
}

export function getCurrentOrg() {
	return request<Org>("/api/me/org");
}
